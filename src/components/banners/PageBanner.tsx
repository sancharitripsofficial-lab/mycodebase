import { getSiteMedia } from "@/lib/data/repository";
import { PageCanvas } from "@/components/PageCanvas";
import { customBanner, type BannerPage } from "@/lib/site-media";
import { PageBanner3D, type PageBanner3DProps } from "./PageBanner3D";

/**
 * Page header: the owner's own picture/video when set in Admin → Site pictures & videos,
 * otherwise the built-in living 3D scene (the default). Also paints the page's own background.
 */
export async function PageBanner({ page, ...props }: PageBanner3DProps & { page: BannerPage }) {
  const media = await getSiteMedia();
  return (
    <>
      {/* The page's coloured, patterned background (behind everything). */}
      <PageCanvas theme={page} />
      <PageBanner3D {...props} custom={customBanner(media, page)} />
    </>
  );
}
