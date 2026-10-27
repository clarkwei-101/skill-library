import ZlibSearch from '@/components/ZlibSearch';

export const metadata = {
  title: 'Search — Skill Library',
  description: 'Search Z-Library for source material and grab it as a mirror link.',
};

export default function SearchPage() {
  return (
    <div className="page">
      <div className="page__head">
        <h1>Search the catalogue</h1>
        <p>
          Look up books across Z-Library, pick a mirror, then feed the file through the converter on
          the upload page.
        </p>
      </div>
      <ZlibSearch />
    </div>
  );
}
