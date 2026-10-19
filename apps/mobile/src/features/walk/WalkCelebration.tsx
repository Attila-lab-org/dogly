import React, { useEffect, useState } from 'react';
import { AvatarActor } from '@/features/core/AvatarActor';
export function WalkCelebration({ photoUri, dogName }: { photoUri?: string | null; dogName: string }) {
  const [celebrating, setCelebrating] = useState(true);
  useEffect(() => { const id = setTimeout(() => setCelebrating(false), 1600); return () => clearTimeout(id); }, []);
  return <AvatarActor photoUri={photoUri} dogName={dogName} size={76} expression={celebrating ? 'celebrate' : 'happy'} animate={celebrating} />;
}
