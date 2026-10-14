import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

import { PAGE_HEIGHT, PAGE_WIDTH } from "./DashboardReport";

/**
 * Captures each report page as an image and lays them out as A4 pages - the PDF is
 * pixel-for-pixel what the preview shows. Pages are captured one at a time (not in
 * parallel) to keep peak memory low on long reports.
 */
export async function downloadReportPdf(
  pages: HTMLElement[],
  filename: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (const [idx, page] of pages.entries()) {
    onProgress?.(idx, pages.length);
    // Let the progress label paint before the (blocking) capture of the next page.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const image = await toPng(page, {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      // The preview shrinks pages with a CSS transform on their parent - capture them
      // at their real size, without the on-screen shadow.
      style: { transform: "none", boxShadow: "none", margin: "0" },
    });
    if (idx > 0) pdf.addPage();
    pdf.addImage(image, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
  }

  pdf.setProperties({ title: "Relatório do dashboard · Cartuga", creator: "Cartuga" });
  pdf.save(filename);
}
