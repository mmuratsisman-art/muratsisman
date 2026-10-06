'use client';

import { useActionState } from 'react';
import type { Intent } from '@/lib/cms/admin/intent';
import { idleState, type FormState } from '@/lib/cms/admin/state';

type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Ortak form altyapısı (Notes ve Lab): işlem türünü (kaydet / yayınla) FormData'ya AÇIKÇA yazar.
 *
 * Gönderen düğmenin name/value'suna GÜVENİLMEZ: React'in sentetik form gönderiminde submitter bilgisinin FormData'ya
 * girmesi sürüme bağlı bir uygulama ayrıntısıdır. Bunun yerine her düğme `formAction={submitAs('...')}` kullanır:
 * React bu düğmeye basıldığında bu fonksiyonu çağırır, fonksiyon intent'i yazıp gerçek Server Action'ı tetikler.
 * Düğmeye basılmadan (ör. requestSubmit) form gönderilirse intent hiç yazılmaz → sunucu fail-closed reddeder.
 */
export function useIntentAction(action: ServerAction) {
  const [state, dispatch, pending] = useActionState(action, idleState);
  const submitAs = (intent: Intent) => (formData: FormData) => {
    formData.set('intent', intent);
    dispatch(formData);
  };
  return { state, pending, formAction: dispatch, submitAs };
}
