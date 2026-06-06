import { DownloadCenter } from "@/components/download/download-center";
import { createDownloadMetadata } from "../download-route-metadata";

export const revalidate = 3600;

export const metadata = createDownloadMetadata("mac");

export default function MacDownloadPage() {
  return <DownloadCenter selectedPlatform="mac" />;
}

