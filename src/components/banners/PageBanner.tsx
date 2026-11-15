import { getSiteMedia } from "@/lib/data/repository";
import { customBanner, type BannerPage } from "@/lib/site-media";
import { PageBanner3D, type PageBanner3DProps } from "./PageBanner3D";

/**
 * Page header: the owner's own picture/video when set in Admin → Site pictures & videos,
 * otherwise the built-in living 3D scene.
 */
export async function PageBanner({ page, ...props }: PageBanner3DProps & { page: BannerPage }) {
  const media = await getSiteMedia();
  return <PageBanner3D {...props} custom={customBanner(media, page)} />;
}
