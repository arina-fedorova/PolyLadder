export interface ExtractedPage {
  pageNumber: number;
  text: string;
  metadata: {
    hasImages: boolean;
    wordCount: number;
  };
}

export interface ExtractionResult {
  totalPages: number;
  pages: ExtractedPage[];
  metadata: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
}

export class PDFExtractorService {
  async extractFromBuffer(buffer: Buffer): Promise<ExtractionResult> {
    const pdfParse = await import('pdf-parse');
    const data = await pdfParse.default(buffer);

    const textPerPage = this.splitByPages(data.text, data.numpages);
    const pages: ExtractedPage[] = [];

    for (let i = 0; i < textPerPage.length; i++) {
      pages.push({
        pageNumber: i + 1,
        text: textPerPage[i],
        metadata: {
          hasImages: false,
          wordCount: textPerPage[i].split(/\s+/).filter((w) => w.length > 0).length,
        },
      });
    }

    const info = data.info as Record<string, string> | undefined;

    return {
      totalPages: data.numpages,
      pages,
      metadata: {
        title: info?.Title,
        author: info?.Author,
        creationDate: info?.CreationDate,
      },
    };
  }

  private splitByPages(text: string, numPages: number): string[] {
    const pages: string[] = [];
    const avgCharsPerPage = Math.ceil(text.length / numPages);

    let remaining = text;
    for (let i = 0; i < numPages - 1; i++) {
      let splitPoint = avgCharsPerPage;

      const nextParagraph = remaining.indexOf('\n\n', avgCharsPerPage - 100);
      if (nextParagraph !== -1 && nextParagraph < avgCharsPerPage + 200) {
        splitPoint = nextParagraph + 2;
      }

      pages.push(remaining.substring(0, splitPoint).trim());
      remaining = remaining.substring(splitPoint).trim();
    }

    if (remaining.length > 0) {
      pages.push(remaining);
    }

    while (pages.length < numPages) {
      pages.push('');
    }

    return pages;
  }
}
