import type { Metadata } from "next";
import {
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_IMAGE_PATH,
  SEO_DEFAULT_TITLE,
  SEO_LOCALE,
  SEO_SITE_NAME,
  SEO_TITLE_TEMPLATE,
  SEO_TWITTER_CARD,
  absoluteAssetUrl,
  absoluteSeoUrl
} from "@/lib/seo/config";
import { getSeoUrl } from "@/lib/app-url";

type SeoMetadataInput = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  type?: "website" | "article";
};

export function createSeoMetadata({
  title,
  description = SEO_DEFAULT_DESCRIPTION,
  path = "/",
  image = SEO_DEFAULT_IMAGE_PATH,
  noIndex = false,
  type = "website"
}: SeoMetadataInput = {}): Metadata {
  const canonical = absoluteSeoUrl(path);
  const imageUrl = absoluteAssetUrl(image);
  const resolvedTitle = title || SEO_DEFAULT_TITLE;

  return {
    applicationName: SEO_SITE_NAME,
    metadataBase: new URL(getSeoUrl()),
    title: title
      ? resolvedTitle
      : {
          default: SEO_DEFAULT_TITLE,
          template: SEO_TITLE_TEMPLATE
        },
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: SEO_SITE_NAME,
      statusBarStyle: "default"
    },
    formatDetection: {
      telephone: false
    },
    alternates: {
      canonical
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon.png", type: "image/png", sizes: "512x512" }
      ],
      shortcut: ["/favicon.ico"],
      apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }]
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true
          }
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1
          }
        },
    openGraph: {
      title: resolvedTitle,
      description,
      url: canonical,
      siteName: SEO_SITE_NAME,
      locale: SEO_LOCALE,
      type,
      images: [
        {
          url: imageUrl,
          width: 1600,
          height: 900,
          alt: `${SEO_SITE_NAME} - nền tảng gọi món QR cho quán Việt`
        }
      ]
    },
    twitter: {
      card: SEO_TWITTER_CARD,
      title: resolvedTitle,
      description,
      images: [imageUrl]
    }
  };
}

export const defaultSeoMetadata = createSeoMetadata();

export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true
    }
  }
};
