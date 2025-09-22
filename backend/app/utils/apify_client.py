from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

DEFAULT_BASE_URL = "https://api.apify.com/v2"
DEFAULT_NODE_TIMEOUT_BUFFER = 30


class ApifyClientError(Exception):
    """Base error for Apify client issues."""


class ApifyRunTimeoutError(ApifyClientError):
    """Raised when an Apify actor run does not finish in time."""


class ApifyNodeRunnerError(ApifyClientError):
    """Raised when the optional Node.js bridge cannot fulfil the request."""

    def __init__(self, message: str, *, should_fallback: bool = False) -> None:
        super().__init__(message)
        self.should_fallback = should_fallback


class ApifyClient:
    def __init__(
        self,
        api_token: str,
        actor_id: str,
        base_url: str = DEFAULT_BASE_URL,
        default_timeout: int = 30,
        use_node_runner: Optional[bool] = None,
        node_runner_path: Optional[str] = None,
        node_command: Optional[str] = None,
    ) -> None:
        if not api_token:
            raise ValueError("Apify API token is required")
        if not actor_id:
            raise ValueError("Apify actor ID is required")

        self.api_token = api_token
        self.actor_id = actor_id
        self.base_url = base_url.rstrip("/")
        self.default_timeout = max(default_timeout, 1)
        self._session = requests.Session()
        self._last_runner: Optional[str] = None

        env_preference = (os.getenv("APIFY_USE_NODE_CLIENT", "auto") or "auto").strip().lower()
        if use_node_runner is not None:
            prefer_node = use_node_runner
        elif env_preference in {"1", "true", "yes", "on"}:
            prefer_node = True
        elif env_preference in {"0", "false", "no", "off"}:
            prefer_node = False
        else:
            prefer_node = True  # auto-mode prefers Node runner when available

        default_runner = Path(__file__).resolve().parent / "apify_node_runner" / "runner.mjs"
        configured_runner = node_runner_path or os.getenv("APIFY_NODE_RUNNER_PATH")
        self._node_runner_path = Path(configured_runner) if configured_runner else default_runner
        self._node_command = node_command or os.getenv("APIFY_NODE_COMMAND", "node")
        timeout_buffer_env = os.getenv("APIFY_NODE_TIMEOUT_BUFFER_SECONDS")
        try:
            buffer_value = int(timeout_buffer_env) if timeout_buffer_env else DEFAULT_NODE_TIMEOUT_BUFFER
        except ValueError:
            buffer_value = DEFAULT_NODE_TIMEOUT_BUFFER
        self._node_timeout_buffer = max(buffer_value, 5)

        self._prefer_node = prefer_node
        self._node_runner_available = False
        self._node_runner_failed = False
        if prefer_node and self._node_runner_path.exists() and shutil.which(self._node_command):
            self._node_runner_available = True

    def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        timeout = kwargs.pop("timeout", self.default_timeout)
        response = self._session.request(method, url, timeout=timeout, **kwargs)
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:  # pragma: no cover - thin wrapper
            raise ApifyClientError(f"Apify API error: {exc}") from exc
        payload = response.json()
        return payload.get("data", payload)

    def run_actor(self, run_input: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/acts/{self.actor_id}/runs?token={self.api_token}"
        return self._request("POST", url, json=run_input)

    def get_run(self, run_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/actor-runs/{run_id}?token={self.api_token}"
        return self._request("GET", url)

    def get_dataset_items(self, dataset_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        params = {"token": self.api_token}
        if limit is not None:
            params["limit"] = str(limit)
        url = f"{self.base_url}/datasets/{dataset_id}/items"
        response = self._session.get(url, params=params, timeout=self.default_timeout)
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:  # pragma: no cover - thin wrapper
            raise ApifyClientError(f"Failed to read dataset: {exc}") from exc
        try:
            return response.json()
        except ValueError as exc:  # pragma: no cover - should be valid JSON
            raise ApifyClientError("Apify dataset response was not JSON") from exc

    def get_key_value_record(self, store_id: str, record_key: str = "INPUT") -> Dict[str, Any]:
        params = {"token": self.api_token}
        url = f"{self.base_url}/key-value-stores/{store_id}/records/{record_key}"
        response = self._session.get(url, params=params, timeout=self.default_timeout)
        if response.status_code == 404:
            return {}
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            raise ApifyClientError(f"Failed to read key-value record: {exc}") from exc

        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type.lower():
            return response.json()
        try:
            payload = response.json()
            if isinstance(payload, dict):
                return payload
        except ValueError:
            pass
        text_value = response.text
        return {"value": text_value}

    def run_and_collect(
        self,
        run_input: Dict[str, Any],
        poll_interval: int = 5,
        timeout_seconds: int = 180,
        dataset_limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        timeout_seconds = max(timeout_seconds or 0, 1)
        if self._should_use_node_runner():
            try:
                return self._run_and_collect_via_node(run_input, timeout_seconds, dataset_limit)
            except ApifyNodeRunnerError as node_error:
                if node_error.should_fallback:
                    self._node_runner_available = False
                    self._node_runner_failed = True
                else:
                    raise
        return self._run_and_collect_via_rest(run_input, poll_interval, timeout_seconds, dataset_limit)

    def _run_and_collect_via_rest(
        self,
        run_input: Dict[str, Any],
        poll_interval: int,
        timeout_seconds: int,
        dataset_limit: Optional[int],
    ) -> List[Dict[str, Any]]:
        run = self.run_actor(run_input)
        run_id = run.get("id") or run.get("_id")
        if not run_id:
            raise ApifyClientError("Apify run response did not include an ID")

        deadline = time.time() + timeout_seconds
        status = run.get("status")
        while status not in {"SUCCEEDED", "FAILED", "ABORTED", "TIMED_OUT"}:
            if time.time() > deadline:
                raise ApifyRunTimeoutError("Apify run did not finish before timeout")
            time.sleep(max(poll_interval, 1))
            run = self.get_run(run_id)
            status = run.get("status")

        if status != "SUCCEEDED":
            raise ApifyClientError(f"Apify run ended with status {status}")

        dataset_id = (
            run.get("defaultDatasetId")
            or run.get("_defaultDatasetId")
            or (run.get("data") or {}).get("defaultDatasetId")
        )
        if not dataset_id:
            self._last_runner = "rest"
            return []
        items = self.get_dataset_items(dataset_id, limit=dataset_limit)
        self._last_runner = "rest"
        return items

    def _run_and_collect_via_node(
        self,
        run_input: Dict[str, Any],
        timeout_seconds: int,
        dataset_limit: Optional[int],
    ) -> List[Dict[str, Any]]:
        if not self._node_runner_available:
            raise ApifyNodeRunnerError("Apify Node runner is not available", should_fallback=True)

        command = [
            self._node_command,
            str(self._node_runner_path),
            "--token",
            self.api_token,
            "--actor",
            self.actor_id,
            "--timeoutSecs",
            str(self.default_timeout),
            "--waitSecs",
            str(timeout_seconds),
        ]
        if dataset_limit is not None:
            command.extend(["--limit", str(dataset_limit)])
        if self.base_url and self.base_url != DEFAULT_BASE_URL:
            command.extend(["--base-url", self.base_url])

        try:
            completed = subprocess.run(
                command,
                input=json.dumps(run_input, ensure_ascii=False),
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout_seconds + self._node_timeout_buffer,
            )
        except FileNotFoundError as exc:
            raise ApifyNodeRunnerError(
                f"Node command '{self._node_command}' was not found",
                should_fallback=True,
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise ApifyRunTimeoutError("Apify Node runner timed out waiting for actor completion") from exc

        stdout = (completed.stdout or "").strip()
        stderr = (completed.stderr or "").strip()

        if completed.returncode != 0:
            message = stderr or stdout or "Unknown error from Apify Node runner"
            lower_message = message.lower()
            if "cannot find module" in lower_message or "err_module_not_found" in lower_message:
                raise ApifyNodeRunnerError(
                    "Apify Node runner dependencies are missing. Run 'npm install' in backend/app/utils/apify_node_runner.",
                    should_fallback=True,
                )
            try:
                error_payload = json.loads(message)
                message = error_payload.get("message", message)
                status_code = error_payload.get("statusCode")
                if status_code:
                    message = f"{message} (status {status_code})"
            except json.JSONDecodeError:
                pass
            raise ApifyClientError(f"Apify Node runner failed: {message}")

        if not stdout:
            self._last_runner = "node"
            return []
        try:
            items = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise ApifyNodeRunnerError(
                "Apify Node runner returned malformed JSON output",
                should_fallback=True,
            ) from exc
        if not isinstance(items, list):
            raise ApifyClientError("Apify Node runner produced unexpected output format")
        self._last_runner = "node"
        return items

    def _should_use_node_runner(self) -> bool:
        return self._prefer_node and not self._node_runner_failed and self._node_runner_available

    def close(self) -> None:
        self._session.close()

    def runtime_info(self) -> Dict[str, Any]:
        """Return diagnostics about the configured Apify runner."""
        return {
            "prefer_node": self._prefer_node,
            "node_available": self._node_runner_available,
            "node_failed": self._node_runner_failed,
            "using_node": self._should_use_node_runner(),
            "last_runner": self._last_runner,
        }
