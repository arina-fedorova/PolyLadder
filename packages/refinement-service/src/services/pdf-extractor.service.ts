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

interface PDFParseResult {
  text: string;
  numpages: number;
  info?: {
    Title?: string;
    Author?: string;
    CreationDate?: string;
  };
}

export class PDFExtractorService {
  async extractFromBuffer(buffer: Buffer): Promise<ExtractionResult> {
    const pdfParse = await import('pdf-parse');

    // Make a fresh copy of buffer for each attempt to avoid state issues
    const getBuffer = () => Buffer.from(buffer);

    // Strategy 1: Standard parsing (works for 95% of PDFs)
    try {
      const data = (await pdfParse.default(getBuffer())) as PDFParseResult;
      return this.buildExtractionResult(data);
    } catch {
      // Continue to fallback strategies
    }

    // Strategy 2: Parse with max: 0 (parse all pages, not just first)
    try {
      const data = (await pdfParse.default(getBuffer(), {
        max: 0,
      })) as PDFParseResult;
      return this.buildExtractionResult(data);
    } catch {
      // Continue to next strategy
    }

    // Strategy 3: Try with empty options object
    try {
      const data = (await pdfParse.default(getBuffer(), {})) as PDFParseResult;
      return this.buildExtractionResult(data);
    } catch {
      // Continue to next strategy
    }

    // Strategy 4: Try with version specified
    try {
      const data = (await pdfParse.default(getBuffer(), {
        version: 'default',
      })) as PDFParseResult;
      return this.buildExtractionResult(data);
    } catch {
      // Continue to next strategy
    }

    // Strategy 5: Custom page renderer that ignores errors per page
    try {
      const data = (await pdfParse.default(getBuffer(), {
        max: 0,
        pagerender: async (pageData: unknown) => {
          try {
            const page = pageData as {
              getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
            };
            const textContent = await page.getTextContent();
            return textContent.items.map((item) => item.str).join(' ');
          } catch {
            // Return empty string for failed pages
            return '';
          }
        },
      })) as PDFParseResult;
      return this.buildExtractionResult(data);
    } catch {
      // Continue to next strategy
    }

    // Strategy 6: Try combining max: 0 with custom renderer
    try {
      const data = (await pdfParse.default(getBuffer(), {
        max: 0,
        version: 'default',
        pagerender: async (pageData: unknown) => {
          try {
            const page = pageData as {
              getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
            };
            const textContent = await page.getTextContent();
            let text = '';
            for (const item of textContent.items) {
              text += item.str + ' ';
            }
            return text;
          } catch {
            return '';
          }
        },
      })) as PDFParseResult;
      return this.buildExtractionResult(data);
    } catch (error) {
      // All strategies failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `PDF extraction failed after trying 6 different strategies. ` +
          `The file may be corrupted, encrypted, password-protected, or use an unsupported format. ` +
          `Technical details: ${errorMessage}`
      );
    }
  }

  private buildExtractionResult(data: PDFParseResult): ExtractionResult {
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

    const info = data.info;

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
