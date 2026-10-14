import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import { confirmImport, exportDatabase, restoreBackup, validateImport } from "../../services/databaseApi";
import type { ImportConfirmResult, ImportPreview } from "../../types";

const cardClass = "rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-5 dark:border-neutral-800";

export function DatabaseTab() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  const exportMutation = useMutation({
    mutationFn: exportDatabase,
    onSuccess: () => showToast("Exportação concluída.", "success"),
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível exportar o banco."), "error"),
  });

  const validateMutation = useMutation({
    mutationFn: (file: File) => validateImport(file),
    onSuccess: (result) => {
      setPreview(result);
      setConfirmResult(null);
      if (!result.valid) {
        showToast("O arquivo tem erros de validação. Veja o resumo abaixo.", "error");
      } else {
        showToast("Arquivo válido. Revise o resumo antes de confirmar.", "success");
      }
    },
    onError: (err) => showToast(extractErrorMessage(err, "Não foi possível validar o arquivo."), "error"),
  });

  const confirmMutation = useMutation({
    mutationFn: (file: File) => confirmImport(file),
    onSuccess: (result) => {
      setConfirmResult(result);
      setPreview(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Importação concluída. O banco foi substituído.", "success");
    },
    onError: (err) => showToast(extractErrorMessage(err, "Falha na importação. Nada foi alterado."), "error"),
    onSettled: () => setConfirmOpen(false),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreBackup,
    onSuccess: () => {
      showToast("Backup restaurado com sucesso.", "success");
      setRestoreConfirmOpen(false);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err, "Não foi possível restaurar o backup."), "error");
      setRestoreConfirmOpen(false);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreview(null);
    setConfirmResult(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={cardClass}>
        <h2 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Exportar</h2>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Gera um arquivo .xlsx com todos os dados do banco (usuários, entradas, saídas,
          parcelas e ajustes). Senhas nunca são incluídas.
        </p>
        <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
          {exportMutation.isPending ? "Exportando..." : "Exportar banco de dados"}
        </Button>
      </div>

      <div className={cardClass}>
        <h2 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Importar</h2>
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">
          Atenção: a importação <strong>substitui completamente</strong> os dados atuais.
          Um backup é gerado automaticamente antes de qualquer alteração.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="mb-4 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-300 dark:text-neutral-300 dark:file:bg-neutral-700 dark:file:text-neutral-100"
        />

        <Button
          variant="secondary"
          disabled={!selectedFile}
          loading={validateMutation.isPending}
          onClick={() => selectedFile && validateMutation.mutate(selectedFile)}
        >
          {validateMutation.isPending ? "Validando..." : "Validar arquivo"}
        </Button>

        {preview && (
          <div className="mt-4 rounded-lg border border-neutral-300 p-4 dark:border-neutral-800">
            <p
              className={`mb-2 text-sm font-medium ${
                preview.valid ? "text-cartuga-700 dark:text-cartuga-200" : "text-red-600 dark:text-red-400"
              }`}
            >
              {preview.valid ? "Arquivo válido." : `${preview.errors.length} erro(s) encontrado(s).`}
            </p>

            {preview.valid && (
              <ul className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
                {Object.entries(preview.counts).map(([sheet, count]) => (
                  <li key={sheet}>
                    {sheet}: {count} registro(s)
                  </li>
                ))}
              </ul>
            )}

            {!preview.valid && (
              <ul className="mb-3 max-h-48 overflow-y-auto text-xs text-red-600 dark:text-red-400">
                {preview.errors.map((issue, idx) => (
                  <li key={idx}>
                    [{issue.sheet}
                    {issue.row ? ` linha ${issue.row}` : ""}] {issue.message}
                  </li>
                ))}
              </ul>
            )}

            {preview.valid && (
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                Confirmar importação
              </Button>
            )}
          </div>
        )}

        {confirmResult && (
          <div className="mt-4 rounded-lg border border-neutral-300 p-4 dark:border-neutral-800">
            <p className="mb-2 text-sm font-medium text-cartuga-700 dark:text-cartuga-200">
              Importação concluída. Senhas temporárias geradas (mostradas apenas uma vez):
            </p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300">
              {Object.entries(confirmResult.temporary_passwords).map(([email, password]) => (
                <li key={email} className="font-mono">
                  {email}: {password}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={cardClass}>
        <h2 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Restaurar backup
        </h2>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Restaura o banco a partir do backup mais recente (gerado automaticamente antes da
          última importação).
        </p>
        <Button variant="secondary" onClick={() => setRestoreConfirmOpen(true)}>
          Restaurar último backup
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar importação?"
        message="Isso substituirá TODOS os dados atuais pelos dados do arquivo. Um backup será gerado antes. Esta ação não pode ser desfeita pela interface."
        confirmLabel="Substituir dados"
        loadingLabel="Importando..."
        loading={confirmMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => selectedFile && confirmMutation.mutate(selectedFile)}
      />

      <ConfirmDialog
        open={restoreConfirmOpen}
        title="Restaurar backup?"
        message="Isso substituirá os dados atuais pelo conteúdo do backup mais recente."
        confirmLabel="Restaurar"
        loadingLabel="Restaurando..."
        loading={restoreMutation.isPending}
        onCancel={() => setRestoreConfirmOpen(false)}
        onConfirm={() => restoreMutation.mutate()}
      />
    </div>
  );
}
