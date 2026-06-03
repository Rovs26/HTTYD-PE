import type { GeneratedImage } from "@/lib/types";
import type { ComputedRanking } from "@/lib/game/ranking";

export function topRankedPlayerIds(rankings: ComputedRanking[], limit = 4) {
  return rankings
    .filter((ranking) => ranking.rank > 0)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, limit)
    .map((ranking) => ranking.player_id);
}

export function partitionImagesForArchive(input: {
  images: GeneratedImage[];
  finalRoundId: string;
  finalistPlayerIds: string[];
}) {
  const finalistIds = new Set(input.finalistPlayerIds);
  const keptImageIds = input.images
    .filter(
      (image) => image.round_id === input.finalRoundId && finalistIds.has(image.player_id)
    )
    .map((image) => image.id);
  const keptIds = new Set(keptImageIds);
  const cleanupImages = input.images.filter(
    (image) => !keptIds.has(image.id) && Boolean(image.image_url || image.image_storage_path)
  );
  const cleanupStoragePaths = [
    ...new Set(
      cleanupImages
        .map((image) => image.image_storage_path)
        .filter((path): path is string => Boolean(path))
    )
  ];

  return {
    keptImageIds,
    cleanupImageIds: cleanupImages.map((image) => image.id),
    cleanupStoragePaths
  };
}
