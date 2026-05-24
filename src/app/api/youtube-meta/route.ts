import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    const data = await response.json();

    // Extract video ID for thumbnail
    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/
    );
    const videoId = videoIdMatch?.[1];

    return NextResponse.json({
      title: data.title,
      author: data.author_name,
      thumbnailUrl: videoId
        ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        : data.thumbnail_url,
    });
  } catch (error) {
    console.error("YouTube meta error:", error);
    return NextResponse.json(
      { error: "Failed to fetch YouTube metadata" },
      { status: 500 }
    );
  }
}
