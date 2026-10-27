import UploadForm from '@/components/UploadForm';

export const metadata = {
  title: 'Upload — Skill Library',
  description: 'Convert a PDF, EPUB, DOCX or TXT document into a downloadable skill.',
};

export default function UploadPage() {
  return (
    <div className="page">
      <div className="page__head">
        <h1>Upload a document</h1>
        <p>
          Drop in a PDF, EPUB, DOCX or TXT file. The backend converts it into a packaged skill and
          this page tracks the conversion until the download is ready.
        </p>
      </div>
      <UploadForm />
    </div>
  );
}
