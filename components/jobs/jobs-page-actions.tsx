"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { feedPlatformLabels, type FeedPlatform } from "@/lib/feed-platform";
import styles from "./jobs-page-sections.module.css";

type JobsPageHeaderProps = {
  isSyncing: boolean;
  activeSyncPlatform: FeedPlatform | null;
  onSyncAll: () => void;
  onSyncPlatform: (platform: Exclude<FeedPlatform, "all">) => void;
  onOpenSaveModal: () => void;
};

const PLATFORM_BUTTONS: Array<Exclude<FeedPlatform, "all">> = [
  "indeed",
  "linkedin",
  "saramin",
  "jobkorea",
];

export function JobsPageHeader({
  isSyncing,
  activeSyncPlatform,
  onSyncAll,
  onSyncPlatform,
  onOpenSaveModal,
}: JobsPageHeaderProps) {
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);

  const handleSyncAll = () => {
    setIsMobileActionsOpen(false);
    onSyncAll();
  };

  const handleSyncPlatform = (platform: Exclude<FeedPlatform, "all">) => {
    setIsMobileActionsOpen(false);
    onSyncPlatform(platform);
  };

  const handleOpenSaveModal = () => {
    setIsMobileActionsOpen(false);
    onOpenSaveModal();
  };

  return (
    <header className={styles.pageHeader}>
      <div className={styles.headerTop}>
        <div>
          <h2 className="text-xl font-semibold">Job Postings</h2>
          <p className="text-sm text-slate-500">
            Search, filter, sort, and track your frontend application pipeline.
          </p>
        </div>
        <button
          type="button"
          className={styles.mobileActionsButton}
          aria-label={
            isMobileActionsOpen ? "Close jobs actions" : "Open jobs actions"
          }
          aria-expanded={isMobileActionsOpen}
          aria-controls="jobs-actions-menu"
          onClick={() => setIsMobileActionsOpen((isOpen) => !isOpen)}
        >
          {isMobileActionsOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      <div
        id="jobs-actions-menu"
        className={`${styles.pageActions} ${
          isMobileActionsOpen ? styles.pageActionsOpen : ""
        }`}
      >
        <div className={styles.primaryActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={handleSyncAll}
            disabled={isSyncing}
          >
            {isSyncing && activeSyncPlatform === "all"
              ? "Syncing..."
              : "Sync all"}
          </Button>
          <Button type="button" onClick={handleOpenSaveModal}>
            Save new
          </Button>
        </div>
        <div
          className={styles.platformActions}
          aria-label="Platform sync actions"
        >
          {PLATFORM_BUTTONS.map((platform) => (
            <Button
              key={platform}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => handleSyncPlatform(platform)}
              disabled={isSyncing}
            >
              {isSyncing && activeSyncPlatform === platform
                ? "Syncing..."
                : feedPlatformLabels[platform]}
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}

type JobsEmptyStateCardProps = {
  isSyncing: boolean;
  activeSyncPlatform: FeedPlatform | null;
  onSyncAll: () => void;
  onSyncPlatform: (platform: Exclude<FeedPlatform, "all">) => void;
  onOpenSaveModal: () => void;
};

export function JobsEmptyStateCard({
  isSyncing,
  activeSyncPlatform,
  onSyncAll,
  onSyncPlatform,
  onOpenSaveModal,
}: JobsEmptyStateCardProps) {
  return (
    <Card className="space-y-3" role="status" aria-live="polite">
      <h3 className="text-base font-semibold">No saved postings yet</h3>
      <p className="text-sm text-slate-500">
        Start from an empty workspace. Sample data is not auto-loaded in this
        environment.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onOpenSaveModal}>
          Save New Posting
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onSyncAll}
          disabled={isSyncing}
        >
          {isSyncing && activeSyncPlatform === "all"
            ? "Syncing all..."
            : "Sync All Feeds"}
        </Button>
        {PLATFORM_BUTTONS.map((platform) => (
          <Button
            key={platform}
            type="button"
            variant="secondary"
            onClick={() => onSyncPlatform(platform)}
            disabled={isSyncing}
          >
            {isSyncing && activeSyncPlatform === platform
              ? "Syncing " + feedPlatformLabels[platform] + "..."
              : "Sync " + feedPlatformLabels[platform]}
          </Button>
        ))}
      </div>
    </Card>
  );
}
