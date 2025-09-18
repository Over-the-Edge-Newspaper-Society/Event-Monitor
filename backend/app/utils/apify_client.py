from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests


class ApifyClientError(Exception):
    """Base error for Apify client issues."""


class ApifyRunTimeoutError(ApifyClientError):
    """Raised when an Apify actor run does not finish in time."""


class ApifyClient:
    def __init__(
        self,
        api_token: str,
        actor_id: str,
        base_url: str = "https://api.apify.com/v2",
        default_timeout: int = 30,
    ) -> None:
        if not api_token:
            raise ValueError("Apify API token is required")
        if not actor_id:
            raise ValueError("Apify actor ID is required")
        self.api_token = api_token
        self.actor_id = actor_id
        self.base_url = base_url.rstrip("/")
        self.default_timeout = default_timeout
        self._session = requests.Session()

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
        url = f"{self.base_url}/actors/{self.actor_id}/runs?token={self.api_token}"
        data = self._request("POST", url, json={"input": run_input})
        return data

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

    def run_and_collect(
        self,
        run_input: Dict[str, Any],
        poll_interval: int = 5,
        timeout_seconds: int = 180,
        dataset_limit: Optional[int] = None,
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
            time.sleep(poll_interval)
            run = self.get_run(run_id)
            status = run.get("status")

        if status != "SUCCEEDED":
            raise ApifyClientError(f"Apify run ended with status {status}")

        dataset_id = run.get("defaultDatasetId")
        if not dataset_id:
            return []
        return self.get_dataset_items(dataset_id, limit=dataset_limit)

    def close(self) -> None:
        self._session.close()
