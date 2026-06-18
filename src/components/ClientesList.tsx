/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Cliente } from '../types';
import { User, Phone, Mail, FileText, Search, Plus, Trash2, Edit2, Users, MapPin, MessageSquare, Lock } from 'lucide-react';

interface ClientesListProps {
  clientes: Cliente[];
  onSelectCliente: (cliente: Cliente) => void;
  selectedClienteId: string | null;
  onAddCliente: (cliente: Omit<Cliente, 'id'>) => Promise<void>;
  onUpdateCliente: (cliente: Cliente) => Promise<void>;
  onDeleteCliente: (id: string) => Promise<void>;
  aeronavesCount: Record<string, number>;
}

export default function ClientesList({
  clientes,
  onSelectCliente,
  selectedClienteId,
  onAddCliente,
  onUpdateCliente,
  onDeleteCliente,
  aeronavesCount
}: ClientesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  
  // State do formulário
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [documento, setDocumento] = useState('');
  const [endereco, setEndereco] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [tipoPessoa, setTipoPessoa] = useState<'PF' | 'PJ'>('PF');
  const [senha, setSenha] = useState('');

  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.documento.includes(searchTerm) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;

    if (editingCliente) {
      await onUpdateCliente({
        id: editingCliente.id,
        nome,
        email,
        telefone,
        documento,
        endereco,
        whatsapp,
        tipoPessoa,
        senha
      });
    } else {
      await onAddCliente({
        nome,
        email,
        telefone,
        documento,
        endereco,
        whatsapp,
        tipoPessoa,
        senha
      });
    }

    // Fechar e limpar formulario
    setIsFormOpen(false);
    setEditingCliente(null);
    setNome('');
    setEmail('');
    setTelefone('');
    setDocumento('');
    setEndereco('');
    setWhatsapp('');
    setTipoPessoa('PF');
    setSenha('');
  };

  const handleEdit = (c: Cliente, e: React.MouseEvent) => {
    e.stopPropagation(); // Evita selecionar o cliente ao clicar no botão de editar
    setEditingCliente(c);
    setNome(c.nome);
    setEmail(c.email);
    setTelefone(c.telefone);
    setDocumento(c.documento);
    setEndereco(c.endereco || '');
    setWhatsapp(c.whatsapp || '');
    setTipoPessoa(c.tipoPessoa || 'PF');
    setSenha(c.senha || '');
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evita selecionar o cliente
    if (confirm('Deseja realmente excluir este cliente? Todas as suas aeronaves e registros de manutenção também serão removidos!')) {
      await onDeleteCliente(id);
    }
  };

  const startNewForm = () => {
    setEditingCliente(null);
    setNome('');
    setEmail('');
    setTelefone('');
    setDocumento('');
    setEndereco('');
    setWhatsapp('');
    setTipoPessoa('PF');
    setSenha('');
    setIsFormOpen(true);
  };

  return (
    <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden flex flex-col h-full shadow-lg" id="clientes-panel">
      {/* Header */}
      <div className="p-5 border-b border-slate-705/30 bg-slate-800/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/15">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display font-bold text-white tracking-tight text-base">Clientes</h2>
            <p className="text-[11px] text-slate-400">Selecione para gerenciar frotas</p>
          </div>
        </div>
        <button
          onClick={startNewForm}
          className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow-md shadow-sky-500/10"
          id="btn-novo-cliente"
        >
          <Plus className="w-4 h-4" />
          Novo
        </button>
      </div>

      {/* Busca */}
      <div className="px-4 py-3 bg-slate-800/20 border-b border-slate-700/40 relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-7 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900/60 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
        />
      </div>

      {/* Lista de Clientes */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-750/30 max-h-[350px] md:max-h-none">
        {filteredClientes.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-medium">
            Nenhum cliente cadastrado.
          </div>
        ) : (
          filteredClientes.map((c) => {
            const isSelected = selectedClienteId === c.id;
            const aeroCount = aeronavesCount[c.id] || 0;
            return (
              <div
                key={c.id}
                onClick={() => onSelectCliente(c)}
                className={`p-4 transition-all cursor-pointer flex items-center justify-between group border-l-4 ${
                  isSelected 
                    ? 'bg-sky-500/10 border-sky-400 pl-3' 
                    : 'border-transparent hover:bg-slate-800/20'
                }`}
                id={`cliente-item-${c.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-semibold text-white text-xs truncate">{c.nome}</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-sky-400 border border-slate-700/40">
                      {aeroCount} {aeroCount === 1 ? 'aeronave' : 'aeronaves'}
                    </span>
                  </div>
                  
                  {/* Dados de contato */}
                  <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="truncate">{c.email || 'Sem e-mail'}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700/50">
                          {c.tipoPessoa || 'PF'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{c.documento || 'Sem doc.'}</span>
                      </div>
                      
                      {c.telefone && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Phone className="w-3 h-3 text-slate-600" />
                          <span>{c.telefone}</span>
                        </div>
                      )}
                    </div>

                    {c.whatsapp && (
                      <div className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-500/80 flex-shrink-0" />
                        <span>Whats: {c.whatsapp}</span>
                      </div>
                    )}

                    {c.endereco && (
                      <div className="flex items-center gap-1.5 text-slate-400/80 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate" title={c.endereco}>{c.endereco}</span>
                      </div>
                    )}

                    {c.senha && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500/80">
                        <Lock className="w-3 h-3 text-slate-600 flex-shrink-0" />
                        <span className="italic">Senha configurada</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all ml-2">
                  <button
                    onClick={(e) => handleEdit(c, e)}
                    className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-700/60 transition-colors"
                    title="Editar Cliente"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(c.id, e)}
                    className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-700/60 transition-colors"
                    title="Excluir Cliente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal/Formulário para Criar/Editar */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="cliente-modal">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 overflow-hidden transform transition-all">
            <div className="bg-slate-800 px-5 py-4 text-white border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-display font-semibold text-sm">
                {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white font-medium text-xs rounded-full p-1 cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome Completo *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: João da Silva Air"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500 font-medium font-sans"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo de Pessoa *</label>
                  <select
                    value={tipoPessoa}
                    onChange={(e) => setTipoPessoa(e.target.value as 'PF' | 'PJ')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200"
                  >
                    <option value="PF">Pessoa Física (PF)</option>
                    <option value="PJ">Pessoa Jurídica (PJ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {tipoPessoa === 'PF' ? 'CPF *' : 'CNPJ *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    placeholder={tipoPessoa === 'PF' ? "Ex: 000.000.000-00" : "Ex: 00.000.000/0001-00"}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Telefone</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      placeholder="Ex: (11) 99999-9999"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1 font-sans">WhatsApp</label>
                  <div className="relative">
                    <MessageSquare className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="Ex: (11) 99999-9999"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Endereço Completo</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Ex: Av. Paulistania, 1200 - Bloco B"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">E-mail (Login) *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ex: contato@cliente.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Criar Senha de Acesso *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition-all cursor-pointer shadow-md shadow-sky-500/10"
                >
                  {editingCliente ? 'Salvar Alterações' : 'Cadastrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
