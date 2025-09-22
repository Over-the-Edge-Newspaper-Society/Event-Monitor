import type { ReactNode } from "react";
import type { TabsConfig } from "../types";

interface TabNavigationProps {
  tabs: TabsConfig[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  refreshButton?: {
    onClick: () => void;
    content: ReactNode;
    disabled?: boolean;
  };
}

export const TabNavigation = ({ tabs, activeTab, onTabChange, refreshButton }: TabNavigationProps) => (
  <nav className="flex space-x-8 px-6">
    {tabs.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        onClick={() => onTabChange(id)}
        className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
          activeTab === id
            ? "border-purple-500 text-purple-600"
            : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        <Icon className="inline h-4 w-4 mr-2" />
        {label}
      </button>
    ))}
    {refreshButton && (
      <button
        onClick={refreshButton.onClick}
        disabled={refreshButton.disabled}
        className="ml-auto flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 disabled:text-gray-400 rounded-lg font-medium transition-colors"
      >
        {refreshButton.content}
      </button>
    )}
  </nav>
);
