import React, { useState, useEffect, useCallback } from 'react';
import { Cliente, UsuarioPiloto } from '../types';
import { User, Mail, Lock, Clock, Edit2, Trash2, Compass } from 'lucide-react';

interface PilotosModalProps {
  cliente: Cliente;
  onClose: () => void;
}

export function PilotosModal({ cliente, onClose }: PilotosModalProps) {
  const [pilotos, setPilotos] = useState<UsuarioPiloto[]>([]);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<UsuarioPiloto | null>(null);
  const [nome, setNome] = useState('');
  const [canac, setCanac] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [tipoPrazo, setTipoPrazo] = useState<'indeterminado' | 'determinado'>('indeterminado');
  const [prazoAcesso, setPrazoAcesso] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchPilotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usuarios-pilotos?clienteId=${cliente.id}`);
      if (res.ok) {
        setPilotos(await res.json());
      } else {
        setError('Erro ao buscar pilotos cadastrados.');
      }
    } catch {
      setError('Erro de conexão ao buscar pilotos.');
    } finally {
      setLoading(false);
    }
  }, [cliente.id]);

  useEffect(() => {
    void fetchPilotos();
  }, [fetchPilotos]);

  const resetForm = () => {
    setEditing(null);
    setNome('');
    setCanac('');
    setEmail('');
    setSenha('');
    setTipoPrazo('indeterminado');
    setPrazoAcesso('');
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const canacClean = canac.replace(/\D/g, '').slice(0, 6);
    if (!nome.trim() || canacClean.length !== 6 || !senha.trim()) {
      setError('Nome, Código ANAC (6 dígitos) e Senha são obrigatórios.');
      return;
    }
    if (tipoPrazo === 'determinado' && !prazoAcesso) {
      setError('Informe a data limite para o prazo determinado.');
      return;
    }

    setError(null);
    const payload = {
      id: editing?.id,
      clienteId: cliente.id,
      nome: nome.trim(),
      canac: canacClean,
      email: email.trim() || undefined,
      senha: senha.trim(),
      tipoPrazo,
      prazoAcesso: tipoPrazo === 'determinado' ? prazoAcesso : undefined,
    };

    try {
      const res = await fetch('/api/usuarios-pilotos', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        resetForm();
        void fetchPilotos();
      } else {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || 'Erro ao salvar cadastro de piloto.');
      }
    } catch {
      setError('Erro de conexão ao salvar piloto.');
    }
  };

  const handleEdit = (p: UsuarioPiloto) => {
    setEditing(p);
    setNome(p.nome);
    setCanac(p.canac || '');
    setEmail(p.email || '');
    setSenha(p.senha);
    setTipoPrazo(p.tipoPrazo);
    setPrazoAcesso(p.prazoAcesso || '');
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja remover este piloto? O acesso dele ao Diário de Bordo será revogado imediatamente.')) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/usuarios-pilotos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        void fetchPilotos();
      } else {
        setError('Erro ao remover piloto.');
      }
    } catch {
      setError('Erro de conexão ao remover piloto.');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 overflow-y-auto flex justify-center items-start p-4 sm:p-6 md:py-10 animate-fade-in"
      id="pilotos-users-modal"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-700 overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-800 px-5 py-4 text-white border-b border-slate-700 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-400">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">
                Cadastro de Pilotos (Acesso Exclusivo Diário de Bordo)
              </h3>
              <p className="text-[10px] text-slate-400">
                Cliente: <strong className="text-slate-200">{cliente.nome}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white font-medium text-xs rounded-full p-1 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[80vh] overflow-y-auto">
          {/* Formulário */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
              {editing ? 'Editar Piloto' : 'Cadastrar Novo Piloto'}
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Ao entrar com o <strong className="text-slate-200">Código ANAC (6 números)</strong> e senha (no celular ou computador), o piloto visualizará{' '}
              <strong className="text-slate-200">apenas o Diário de Bordo</strong> das aeronaves deste cliente.
            </p>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Nome do Piloto (PIC) *
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Cmte. João Silva"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Código ANAC / CANAC (Login - 6 dígitos) *
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  minLength={6}
                  maxLength={6}
                  pattern="\d{6}"
                  value={canac}
                  onChange={(e) => setCanac(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Ex: 123456 (usado como login)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono tracking-wider focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  E-mail (Opcional)
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ex: piloto@loggy.com (opcional)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Senha de Acesso *
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Senha para login"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Prazo do Acesso *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoPrazo('indeterminado')}
                    className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                      tipoPrazo === 'indeterminado'
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Indeterminado
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoPrazo('determinado')}
                    className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                      tipoPrazo === 'determinado'
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Prazo Determinado
                  </button>
                </div>
              </div>

              {tipoPrazo === 'determinado' && (
                <div className="animate-fade-in">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Data Limite de Acesso *
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      required={tipoPrazo === 'determinado'}
                      value={prazoAcesso}
                      onChange={(e) => setPrazoAcesso(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-sky-500 text-slate-200"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded-lg">
                  {error}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                {editing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-1.5 text-[11px] font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="px-3 py-1.5 text-[11px] font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg shadow-sm cursor-pointer"
                >
                  {editing ? 'Atualizar Piloto' : 'Cadastrar Piloto'}
                </button>
              </div>
            </form>
          </div>

          {/* Lista */}
          <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              Pilotos Cadastrados ({pilotos.length})
            </h4>

            {loading ? (
              <p className="text-xs text-slate-500 italic font-mono py-4">
                Carregando pilotos...
              </p>
            ) : pilotos.length === 0 ? (
              <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 text-center">
                <p className="text-xs text-slate-500">
                  Nenhum piloto cadastrado para este cliente.
                </p>
                <p className="text-[10px] text-slate-600 mt-1">
                  Crie um acesso ao lado para o piloto usar no celular apenas o Diário de Bordo.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {pilotos.map((p) => {
                  const isExpired =
                    p.tipoPrazo === 'determinado' &&
                    p.prazoAcesso &&
                    p.prazoAcesso < new Date().toISOString().split('T')[0];
                  return (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-slate-700/60 transition-all flex justify-between items-start gap-2"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-semibold text-slate-200 truncate">
                          {p.nome}
                        </p>
                        {p.canac && (
                          <p className="text-[10px] text-sky-400 font-mono">
                            Login (ANAC): <strong>{p.canac}</strong>
                          </p>
                        )}
                        {p.email && (
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            {p.email}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500">
                          Senha:{' '}
                          <span className="font-mono text-sky-400 font-medium">
                            {p.senha}
                          </span>
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {p.tipoPrazo === 'indeterminado' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold">
                              Acesso Contínuo
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                isExpired
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}
                            >
                              {isExpired
                                ? `EXPIRADO (${p.prazoAcesso?.split('-').reverse().join('/')})`
                                : `Vence em: ${p.prazoAcesso?.split('-').reverse().join('/')}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          className="p-1 text-slate-400 hover:text-sky-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Editar Piloto"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(p.id)}
                          className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Remover Piloto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
