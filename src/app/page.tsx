'use client';

import dynamic from 'next/dynamic';

// `ssr: false` is only allowed from a Client Component, so this page is one.
const Scene = dynamic(() => import('@/components/Scene'), { ssr: false });

export default function Home() {
  return (
    <main className="stage">
      <Scene />
    </main>
  );
}
