"use client";

import { useState } from "react";

type BackupManifest = {
  format: string;
  createdAt: string;
  tableOrder: string[];
  counts: Record<string, number>;
  fingerprint: string;
};

const BACKUP_FORMAT = "MB_GESTAO_FULL_BACKUP_V1";
const ENVELOPE_FORMAT = "MB_GESTAO_ENCRYPTED_BACKUP_V1";
const ITERATIONS = 310000;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBackup(plainText: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(new TextEncoder().encode(plainText))
  );
  return {
    format: ENVELOPE_FORMAT,
    cipher: "AES-GCM-256",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  };
}

async function decryptBackup(envelope: any, password: string) {
  if (
    envelope?.format !== ENVELOPE_FORMAT ||
    envelope?.cipher !== "AES-GCM-256" ||
    envelope?.kdf !== "PBKDF2-SHA256" ||
    envelope?.iterations !== ITERATIONS ||
    typeof envelope?.salt !== "string" ||
    typeof envelope?.iv !== "string" ||
    typeof envelope?.data !== "string"
  ) {
    throw new Error("Arquivo não reconhecido. Selecione um backup criptografado gerado pelo MB Gestão.");
  }
  const key = await deriveKey(password, fromBase64(envelope.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(fromBase64(envelope.iv)) },
    key,
    toArrayBuffer(fromBase64(envelope.data))
  );
  return new TextDecoder().decode(plain);
}

export default function SystemBackupMigration() {
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<BackupManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  async function downloadBackup() {
    if (password.length < 12) {
      setMessage("Defina uma senha com pelo menos 12 caracteres para criptografar o backup.");
      return;
    }
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/migration/system-backup", { cache: "no-store" });
      const backup = await response.json();
      if (!response.ok) throw new Error(backup.error || "Não foi possível gerar o backup.");
      if (backup.format !== BACKUP_FORMAT || !Array.isArray(backup.tableOrder)) {
        throw new Error("O servidor retornou um pacote de backup incompatível.");
      }
      const envelope = await encryptBackup(JSON.stringify(backup), password);
      const blob = new Blob([JSON.stringify(envelope)], { type: "application/vnd.mbgestao.backup+json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mb-gestao-backup-integral-${new Date().toISOString().replace(/[:.]/g, "-")}.mbbackup`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const total = Object.values(backup.counts as Record<string, number>).reduce((sum, count) => sum + Number(count || 0), 0);
      setMessage(`Backup integral gerado e criptografado. ${backup.tableOrder.length} tabelas e ${total.toLocaleString("pt-BR")} registros incluídos. Guarde a senha: ela não pode ser recuperada.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao gerar o backup integral.");
    } finally {
      setBusy(false);
    }
  }

  async function inspectFile(selected: File | null) {
    setFile(selected);
    setManifest(null);
    setResult(null);
    setMessage("");
    if (!selected) return;
    if (selected.size > 100 * 1024 * 1024) {
      setMessage("O arquivo excede o limite de 100 MB por operação.");
      return;
    }
    if (password.length < 12) {
      setMessage("Informe a senha do backup (mínimo de 12 caracteres) para validar o arquivo.");
      return;
    }
    setBusy(true);
    try {
      const envelope = JSON.parse(await selected.text());
      const plain = await decryptBackup(envelope, password);
      const backup = JSON.parse(plain);
      if (backup?.format !== BACKUP_FORMAT || !Array.isArray(backup.tableOrder) || !backup.counts) {
        throw new Error("O conteúdo descriptografado não é um backup integral válido.");
      }
      setManifest({
        format: backup.format,
        createdAt: backup.createdAt,
        tableOrder: backup.tableOrder,
        counts: backup.counts,
        fingerprint: backup.fingerprint,
      });
      setMessage("Senha validada. O manifesto foi lido; nenhum dado foi alterado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível validar o backup. Confira a senha e o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  async function reintegrate() {
    if (!file || !manifest || password.length < 12) return;
    if (!window.confirm(
      "CONFIRMAR REINTEGRAÇÃO DO BACKUP\n\nOs registros ausentes serão incluídos. Registros atuais com conflito de chave serão preservados, sem sobrescrita. A operação será transacional: se houver falha de integridade, todo o lote será revertido.\n\nRecomenda-se gerar um backup atual antes de continuar. Deseja prosseguir?"
    )) return;
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const envelope = JSON.parse(await file.text());
      const plain = await decryptBackup(envelope, password);
      const response = await fetch("/api/migration/system-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: plain,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "A reintegração foi recusada.");
      setResult(data);
      setMessage(data.message || "Reintegração concluída.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na reintegração. Nenhum lote parcial deve ser considerado concluído.");
    } finally {
      setBusy(false);
    }
  }

  const totalRecords = manifest
    ? Object.values(manifest.counts).reduce((sum, count) => sum + Number(count || 0), 0)
    : 0;

  return (
    <div className="panel" style={{ marginBottom: 16, borderLeft: "4px solid #087f73" }}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BACKUP NATIVO · SISTEMA COMPLETO</span>
          <h2>Backup integral e reintegração</h2>
          <p>Gera um arquivo do próprio MB Gestão com todas as tabelas e registros do banco de dados. A reintegração inclui registros ausentes sem sobrescrever os atuais.</p>
        </div>
        <b>● SOMENTE ADMINISTRADOR</b>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>1. Gerar backup completo</h3>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Exporta todas as tabelas públicas do banco, incluindo cadastros, vendas, ordens, estoque, financeiro, usuários, permissões, configurações e históricos.</p>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Senha de criptografia (mínimo 12 caracteres)</label>
          <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Crie uma senha forte" style={{ width: "100%", marginBottom: 10 }} />
          <button className="primary" disabled={busy || password.length < 12} onClick={downloadBackup}>{busy ? "Processando..." : "Gerar e baixar backup integral"}</button>
        </div>

        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>2. Reintegrar backup do sistema</h3>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Selecione um arquivo .mbbackup gerado pelo MB Gestão e informe a mesma senha usada na criação.</p>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Arquivo de backup</label>
          <input type="file" accept=".mbbackup,application/vnd.mbgestao.backup+json,application/json" disabled={busy} onChange={e => void inspectFile(e.target.files?.[0] || null)} style={{ width: "100%", marginBottom: 10 }} />
          <button className="secondary" disabled={busy || !file || !manifest || password.length < 12} onClick={reintegrate}>{busy ? "Processando..." : "Reintegrar dados do backup"}</button>
        </div>
      </div>

      {manifest && (
        <div className="settings-list" style={{ marginTop: 14 }}>
          <div><b>Data de criação</b><span>{new Date(manifest.createdAt).toLocaleString("pt-BR")}</span></div>
          <div><b>Tabelas no backup</b><span>{manifest.tableOrder.length}</span></div>
          <div><b>Registros no backup</b><span>{totalRecords.toLocaleString("pt-BR")}</span></div>
          <div><b>Fingerprint SHA-256</b><code>{manifest.fingerprint.slice(0, 20)}…</code></div>
        </div>
      )}

      {result && (
        <div className="settings-list" style={{ marginTop: 14 }}>
          <div><b>Registros incluídos</b><span>{Number(result.insertedTotal || 0).toLocaleString("pt-BR")}</span></div>
          <div><b>Registros preservados por conflito</b><span>{Number(result.skippedTotal || 0).toLocaleString("pt-BR")}</span></div>
          <div><b>Tabelas processadas</b><span>{result.tables}</span></div>
        </div>
      )}

      {message && <div role="status" className="settings-message" style={{ marginTop: 14 }}>{message}</div>}
      <p style={{ marginBottom: 0, marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
        Segurança: o arquivo baixado é criptografado com AES-256-GCM e PBKDF2-SHA256. Guarde a senha fora do sistema. A reintegração não apaga registros atuais; colisões que impeçam a integridade relacional cancelam toda a transação. Arquivos externos mantidos apenas em serviços de armazenamento não são incluídos neste pacote de banco de dados.
      </p>
    </div>
  );
}
