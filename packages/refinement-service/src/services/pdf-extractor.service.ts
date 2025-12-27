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

    // Strategy 1: Try standard parsing
    try {
      const data = (await pdfParse.default(buffer)) as PDFParseResult;
      return this.buildExtractionResult(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Strategy 2: If XRef error, try with custom options
      if (errorMessage.includes('XRef') || errorMessage.includes('Invalid PDF')) {
        try {
          // Try parsing with maximum pages and ignoring errors
          const data = (await pdfParse.default(buffer, {
            max: 0, // Parse all pages, not just first page
            version: 'default',
          })) as PDFParseResult;
          return this.buildExtractionResult(data);
        } catch {
          // Strategy 3: Try with custom pagerender that ignores errors
          try {
            const data = (await pdfParse.default(buffer, {
              max: 0,
              pagerender: async (pageData: unknown) => {
                try {
                  // Try to render the page text
                  const page = pageData as {
                    getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
                  };
                  return await page.getTextContent().then((textContent) => {
                    return textContent.items.map((item) => item.str).join(' ');
                  });
                } catch {
                  // If page fails, return empty string and continue
                  return '';
                }
              },
            })) as PDFParseResult;
            return this.buildExtractionResult(data);
          } catch {
            throw new Error(
              `PDF extraction failed: The file cannot be processed. ` +
                `Possible reasons: the PDF is corrupted, encrypted, password-protected, or uses an unsupported format. ` +
                `Please verify the file is a valid, unencrypted PDF and try uploading again. ` +
                `Technical details: ${errorMessage}`
            );
          }
        }
      }

      // Re-throw if not XRef related
      throw error;
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
