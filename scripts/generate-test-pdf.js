import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateTestPDF(outputPath) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(20).text('Spanish Learning Material', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('Test Document for PolyLadder System', { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(16).text('Basic Vocabulary:', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12);
  doc.text('Hola - Hello');
  doc.text('Adios - Goodbye');
  doc.text('Gracias - Thank you');
  doc.text('Por favor - Please');
  doc.text('De nada - You are welcome');
  doc.moveDown();

  doc.fontSize(16).text('Grammar Rules:', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12);
  doc.text('El articulo definido: el, la, los, las');
  doc.text('El verbo ser: yo soy, tu eres, el es, nosotros somos');
  doc.text('El verbo estar: yo estoy, tu estas, el esta');
  doc.moveDown();

  doc.fontSize(16).text('Exercises:', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12);
  doc.text('1. Complete the sentence: Yo ___ estudiante.');
  doc.text('2. Translate: How are you? -> ?Como estas?');
  doc.text('3. Conjugate the verb "ser" in present tense.');
  doc.moveDown();

  doc.fontSize(14).text('This is a test document for the PolyLadder document processing system.', {
    align: 'center',
    italic: true,
  });

  doc.end();

  stream.on('finish', () => {
    const stats = fs.statSync(outputPath);
    console.log(`✅ Test PDF generated: ${outputPath}`);
    console.log(`   File size: ${stats.size} bytes`);
  });

  stream.on('error', (error) => {
    console.error('❌ Error generating PDF:', error);
    process.exit(1);
  });
}

const outputPath = path.join(__dirname, '..', 'test-document.pdf');
generateTestPDF(outputPath);

