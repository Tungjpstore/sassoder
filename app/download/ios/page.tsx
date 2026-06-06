import { DownloadCenter } from "@/components/download/download-center";
import { createDownloadMetadata } from "../download-route-metadata";

export const revalidate = 3600;

export const metadata = createDownloadMetadata("ios");

export default function IosDownloadPage() {
  return <DownloadCenter selectedPlatform="ios" />;
}

