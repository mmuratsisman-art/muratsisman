/** Server Action ↔ form sözleşmesi (useActionState). Yalnızca serileştirilebilir alanlar. */
export interface FormState {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Hata durumunda kullanıcının girdiği ham değerler (formu doldurmak için) */
  values?: Record<string, string>;
}

export const idleState: FormState = { status: 'idle' };

export const failure = (message: string, fieldErrors?: Record<string, string>, values?: Record<string, string>): FormState => ({
  status: 'error',
  message,
  fieldErrors,
  values,
});
