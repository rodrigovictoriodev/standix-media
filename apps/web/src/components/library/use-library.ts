"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";
import type {
  Asset,
  AssetDetail,
  AssetFolder,
  LibraryFilters,
  TagSummary,
} from "./types";

// Signed media URLs live for 15 minutes; refresh lists well before that.
const MEDIA_STALE_MS = 5 * 60_000;

function useTeamKey() {
  const { accessToken, teamId, ready } = useApiSession();
  return { teamId, enabled: ready && Boolean(accessToken && teamId) };
}

export const libraryKeys = {
  all: (teamId: string) => ["library", teamId] as const,
  assets: (teamId: string, filters: LibraryFilters) =>
    ["library", teamId, "assets", filters] as const,
  asset: (teamId: string, id: string) =>
    ["library", teamId, "asset", id] as const,
  folders: (teamId: string) => ["library", teamId, "folders"] as const,
  tags: (teamId: string) => ["library", teamId, "tags"] as const,
};

function assetsQueryString(filters: LibraryFilters) {
  const params = new URLSearchParams();
  if (filters.trashed) params.set("trashed", "true");
  if (filters.folderId && !filters.trashed) {
    params.set("folderId", filters.folderId);
    params.set("includeSubfolders", "true");
  }
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.favorite) params.set("favorite", "true");
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function useAssets(filters: LibraryFilters) {
  const { teamId, enabled } = useTeamKey();
  return useQuery({
    queryKey: libraryKeys.assets(teamId, filters),
    queryFn: () => apiRequest<Asset[]>(`/assets${assetsQueryString(filters)}`),
    enabled,
    staleTime: MEDIA_STALE_MS,
    refetchInterval: MEDIA_STALE_MS * 2,
    placeholderData: keepPreviousData,
  });
}

export function useAssetDetail(assetId: string | null) {
  const { teamId, enabled } = useTeamKey();
  return useQuery({
    queryKey: libraryKeys.asset(teamId, assetId ?? ""),
    queryFn: () =>
      apiRequest<AssetDetail>(`/assets/${encodeURIComponent(assetId!)}`),
    enabled: enabled && Boolean(assetId),
    staleTime: MEDIA_STALE_MS,
  });
}

/** Signed URL of the original file, fetched on demand (preview/download). */
export function useAssetOriginalUrl(assetId: string | null, active: boolean) {
  const { teamId, enabled } = useTeamKey();
  return useQuery({
    queryKey: [...libraryKeys.asset(teamId, assetId ?? ""), "url"],
    queryFn: () =>
      apiRequest<{ url: string }>(
        `/assets/${encodeURIComponent(assetId!)}/url`,
      ).then(({ url }) => url),
    enabled: enabled && active && Boolean(assetId),
    staleTime: MEDIA_STALE_MS,
  });
}

export function useFolders() {
  const { teamId, enabled } = useTeamKey();
  return useQuery({
    queryKey: libraryKeys.folders(teamId),
    queryFn: () => apiRequest<AssetFolder[]>("/assets/folders"),
    enabled,
  });
}

export function useTags() {
  const { teamId, enabled } = useTeamKey();
  return useQuery({
    queryKey: libraryKeys.tags(teamId),
    queryFn: () => apiRequest<TagSummary[]>("/assets/tags"),
    enabled,
  });
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

/**
 * Every library mutation. Each one invalidates the whole library cache for the
 * team, since a change can affect lists, counts, folders and tags at once.
 */
export function useLibraryMutations() {
  const { teamId } = useTeamKey();
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: libraryKeys.all(teamId) });
  const assetPath = (id: string, suffix = "") =>
    `/assets/${encodeURIComponent(id)}${suffix}`;

  return {
    upload: useMutation({
      mutationFn: ({ file, folderId }: { file: File; folderId?: string }) => {
        const body = new FormData();
        body.append("file", file);
        if (folderId) body.append("folderId", folderId);
        return apiRequest<Asset>("/assets/upload", { method: "POST", body });
      },
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...body
      }: {
        id: string;
        displayName?: string;
        folderId?: string | null;
      }) => apiRequest<Asset>(assetPath(id), json("PATCH", body)),
      onSuccess,
    }),
    setTags: useMutation({
      mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
        apiRequest<Asset>(assetPath(id, "/tags"), json("PUT", { tags })),
      onSuccess,
    }),
    toggleFavorite: useMutation({
      mutationFn: (id: string) =>
        apiRequest<Asset>(assetPath(id, "/favorite"), json("PATCH")),
      onSuccess,
    }),
    trash: useMutation({
      mutationFn: (id: string) =>
        apiRequest<Asset>(assetPath(id, "/trash"), json("PATCH")),
      onSuccess,
    }),
    restore: useMutation({
      mutationFn: (id: string) =>
        apiRequest<Asset>(assetPath(id, "/restore"), json("PATCH")),
      onSuccess,
    }),
    destroy: useMutation({
      mutationFn: (id: string) => apiRequest(assetPath(id), json("DELETE")),
      onSuccess,
    }),
    createFolder: useMutation({
      mutationFn: (body: { name: string; parentId?: string | null }) =>
        apiRequest<AssetFolder>("/assets/folders", json("POST", body)),
      onSuccess,
    }),
    updateFolder: useMutation({
      mutationFn: ({
        id,
        ...body
      }: {
        id: string;
        name?: string;
        parentId?: string | null;
      }) =>
        apiRequest<AssetFolder>(
          `/assets/folders/${encodeURIComponent(id)}`,
          json("PATCH", body),
        ),
      onSuccess,
    }),
    deleteFolder: useMutation({
      mutationFn: (id: string) =>
        apiRequest(`/assets/folders/${encodeURIComponent(id)}`, json("DELETE")),
      onSuccess,
    }),
  };
}

export async function downloadAsset(id: string) {
  const { url } = await apiRequest<{ url: string }>(
    `/assets/${encodeURIComponent(id)}/url?download=true`,
  );
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
