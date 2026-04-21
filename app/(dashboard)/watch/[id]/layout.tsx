import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase-admin";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Server-side metadata for /watch/[id] — runs at request time.
 * The page itself is a client component so metadata must live in layout.tsx.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://premiumvod.com";

  try {
    const doc = await adminDb.collection("videos").doc(id).get();
    if (!doc.exists) {
      return {
        title: "Video Not Found",
        description: "This video may have been removed.",
      };
    }

    const video = doc.data()!;
    const mediaType = video.mediaType === "image" ? "image" : "video";
    const title = `${video.title} — PremiumVOD`;
    const description =
      video.description?.slice(0, 155) ||
      mediaType === "image"
        ? `View this ${video.category} image on PremiumVOD.`
        : `Stream this ${video.category} video on PremiumVOD. ${Math.floor((video.durationInSeconds ?? 0) / 60)} minutes of premium video content.`;

    const thumbnail = video.thumbnailUrl || `${base}/og-default.jpg`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: mediaType === "image" ? "article" : "video.other",
        url: `${base}/watch/${id}`,
        images: [
          {
            url: thumbnail,
            width: 1280,
            height: 720,
            alt: video.title,
          },
        ],
        siteName: "PremiumVOD",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [thumbnail],
      },
    };
  } catch {
    return {
      title: "PremiumVOD — Premium Video Content",
      description: "Stream premium video content on demand.",
    };
  }
}

export default function WatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
