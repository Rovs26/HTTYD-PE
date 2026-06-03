import { getImageBucket, hasSupabaseServerConfig } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type StoredImage = {
  url: string;
  path: string | null;
};

function publicUrl(path: string) {
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage.from(getImageBucket()).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadImageBase64(input: {
  base64: string;
  path: string;
  contentType: string;
}): Promise<StoredImage> {
  if (!hasSupabaseServerConfig()) {
    return {
      url: `data:${input.contentType};base64,${input.base64}`,
      path: null
    };
  }

  const supabase = getSupabaseAdmin();
  const buffer = Buffer.from(input.base64, "base64");
  const { error } = await supabase.storage
    .from(getImageBucket())
    .upload(input.path, buffer, {
      contentType: input.contentType,
      upsert: true
    });

  if (error) {
    throw error;
  }

  return {
    url: publicUrl(input.path),
    path: input.path
  };
}

export async function uploadDataUrl(input: {
  dataUrl: string;
  path: string;
}): Promise<StoredImage> {
  const match = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return {
      url: input.dataUrl,
      path: null
    };
  }

  return uploadImageBase64({
    base64: match[2],
    path: input.path,
    contentType: match[1]
  });
}
