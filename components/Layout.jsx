import Head from 'next/head';
import Header from './Header';
import Footer from './Footer';

export default function Layout({ title, description, children }) {
  const pageTitle = title ? `${title} · Asentum Explorer` : 'Asentum Explorer';
  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        {description && <meta name="description" content={description} />}
      </Head>
      <div className="min-h-screen flex flex-col bg-black text-white">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </>
  );
}
