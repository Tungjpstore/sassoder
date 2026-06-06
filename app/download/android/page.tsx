import { DownloadCenter } from "@/components/download/download-center";
import { createDownloadMetadata } from "../download-route-metadata";

export const revalidate = 3600;

export const metadata = createDownloadMetadata("android");

export default function AndroidDownloadPage() {
  return <DownloadCenter selectedPlatform="android" />;
}

