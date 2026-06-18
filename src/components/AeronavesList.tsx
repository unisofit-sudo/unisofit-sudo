/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Aeronave, Cliente } from '../types';
import { Plane, Calendar, Gauge, Plus, Trash2, Edit2, ChevronRight, Activity } from 'lucide-react';

interface AeronavesListProps {
  aeronaves: Aeronave[];
  selectedCliente: Cliente | null;
  onSelectAeronave: (aeronave: Aeronave) => void;
  selectedAeronaveId: string | null;
  onAddAeronave: (aeronave: Omit<Aeronave, 'id'>) => Promise<void>;
  onUpdateAeronave: (aeronave: Aeronave) => Promise<void>;
  onDeleteAeronave: (id: string) => Promise<void>;
}

export default function AeronavesList({
  aeronaves,
  selectedCliente,
  onSelectAeronave,
  selectedAeronaveId,
  onAddAeronave,
  onUpdateAeronave,
  onDeleteAeronave
}: AeronavesListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAeronave, setEditingAeronave] = useState<Aeronave | null>(null);

  // State do formulário
  const [matricula, setMatricula] = useState('');
  const [modelo, setModelo] = useState('');
  const [fabricante, setFabricante] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [horasTotais, setHorasTotais] = useState(0);

  const clientAeronaves = selectedCliente 
    ? aeronaves.filter(a => a.clienteId === selectedCliente.id)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCliente || !matricula.trim() || !modelo.trim()) return;

    if (editingAeronave) {
      await onUpdateAeronave({
        id: editingAeronave.id,
        matricula: matricula.toUpperCase().trim(),
        modelo,
        fabricante,
        ano: Number(ano),
        horasTotais: Number(horasTotais),
        clienteId: selectedCliente.id
      });
    } else {
      await onAddAeronave({
        matricula: matricula.toUpperCase().trim(),
        modelo,
        fabricante,
        ano: Number(ano),
        horasTotais: Number(horasTotais),
        clienteId: selectedCliente.id
      });
    }

    setIsFormOpen(false);
    setEditingAeronave(null);
    setMatricula('');
    setModelo('');
    setFabricante('');
    setAno(new Date().getFullYear());
    setHorasTotais(0);
  };

  const handleEdit = (a: Aeronave, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAeronave(a);
    setMatricula(a.matricula);
    setModelo(a.modelo);
    setFabricante(a.fabricante);
    setAno(a.ano);
    setHorasTotais(a.horasTotais);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Deseja realmente excluir esta aeronave? Todo o histórico de voo, componentes e laudos de revisão serão excluídos de forma permanente!')) {
      await onDeleteAeronave(id);
    }
  };

  const startNewForm = () => {
    setEditingAeronave(null);
    setMatricula('');
    setModelo('');
    setFabricante('');
    setAno(new Date().getFullYear());
    setHorasTotais(0);
    setIsFormOpen(true);
  };

  if (!selectedCliente) {
    return (
      <div className="bg-slate-800/20 rounded-2xl border border-slate-700/50 p-8 text-center" id="aeronaves-panel-empty">
        <Plane className="w-10 h-10 text-slate-600 mx-auto mb-3 animate-pulse" />
        <h3 className="text-sm font-semibold text-white font-display">Frota de Aeronaves</h3>
        <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">
          Selecione um cliente no painel esquerdo para visualizar e gerenciar suas aeronaves.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden flex flex-col h-full shadow-lg" id={`aeronaves-panel-${selectedCliente.id}`}>
      {/* Header */}
      <div className="p-5 border-b border-slate-700/40 bg-slate-800/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/15">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display font-bold text-white tracking-tight text-base">Aeronaves</h2>
            <p className="text-xs text-sky-400 font-semibold">Cliente: {selectedCliente.nome}</p>
          </div>
        </div>
        <button
          onClick={startNewForm}
          className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow-md shadow-sky-500/10"
          id="btn-nova-aeronave"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Aeronave
        </button>
      </div>

      {/* Lista de Aeronaves */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-750/30 max-h-[350px] md:max-h-none p-4 space-y-3">
        {clientAeronaves.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs font-medium">
            Nenhuma aeronave cadastrada para este cliente. Adicione a primeira acima!
          </div>
        ) : (
          clientAeronaves.map((a) => {
            const isSelected = selectedAeronaveId === a.id;
            return (
              <div
                key={a.id}
                onClick={() => onSelectAeronave(a)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isSelected 
                    ? 'bg-sky-500/15 border-sky-500/40 shadow-md' 
                    : 'bg-slate-900/30 border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-800/10'
                }`}
                id={`aeronave-card-${a.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl flex-shrink-0 border ${isSelected ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-800/50 text-slate-400 border-slate-700/50'}`}>
                    <Plane className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-white text-base tracking-wide">{a.matricula}</span>
                      <span className="text-[10px] bg-slate-850 text-sky-400 border border-slate-700/50 font-semibold px-2 py-0.5 rounded-full">
                        {a.modelo}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{a.fabricante} • Ano {a.ano}</p>
                    
                    {/* Horas */}
                    <div className="flex items-center gap-1.5 mt-2.5 text-xs text-sky-400 font-semibold bg-sky-950/20 border border-sky-500/20 px-3 py-1.5 rounded-xl w-fit font-mono">
                      <Gauge className="w-3.5 h-3.5" />
                      <span>{a.horasTotais.toFixed(1)} Horas de Voo (T.S.N.)</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 border-t pt-3 md:border-t-0 md:pt-0 border-slate-800/60">
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => handleEdit(a, e)}
                      className="p-1.5 text-slate-400 hover:text-sky-450 hover:bg-slate-800/60 rounded-lg transition-colors"
                      title="Editar Aeronave"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(a.id, e)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800/60 rounded-lg transition-colors"
                      title="Excluir Aeronave"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center text-xs text-sky-450 font-bold gap-0.5 hover:translate-x-1 transition-transform">
                    <span>Acessar Painel</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal para Adicionar/Editar Aeronave */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 overflow-y-auto flex justify-center items-start p-4 sm:p-6 md:py-10 animate-fade-in" id="aeronave-modal">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 overflow-hidden flex flex-col my-auto">
            <div className="bg-slate-800 px-5 py-4 text-white border-b border-slate-700 flex justify-between items-center flex-shrink-0">
              <h3 className="font-display font-semibold text-sm">
                {editingAeronave ? 'Editar Aeronave' : 'Nova Aeronave'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-405 hover:text-white transition-colors text-xs p-1"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Prefixo / Matrícula (Ex: PT-XYZ) *</label>
                <input
                  type="text"
                  required
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                  placeholder="EX: PT-XYZ"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 uppercase font-bold tracking-wider"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Modelo *</label>
                  <input
                    type="text"
                    required
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    placeholder="Ex: Seneca III"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Fabricante *</label>
                  <input
                    type="text"
                    required
                    value={fabricante}
                    onChange={(e) => setFabricante(e.target.value)}
                    placeholder="Ex: Embraer / Piper"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ano de Fabricação</label>
                  <input
                    type="number"
                    value={ano}
                    onChange={(e) => setAno(Number(e.target.value))}
                    min={1930}
                    max={new Date().getFullYear() + 2}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Horas Totais Atuais *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={horasTotais}
                    disabled={!!editingAeronave} // Evitar alteração arbitrária no edit. Usar histórico de voo de preferência!
                    onChange={(e) => setHorasTotais(Number(e.target.value))}
                    min={0}
                    placeholder="Ex: 1450.5"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 disabled:opacity-50"
                  />
                  {editingAeronave && (
                    <span className="text-[9px] text-slate-400 block mt-1 leading-normal">
                      As horas devem ser atualizadas inserindo novos voos no diário de bordo.
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 text-xs font-medium text-white bg-sky-500 hover:bg-sky-650 rounded-xl transition-all cursor-pointer shadow-md shadow-sky-500/10"
                >
                  {editingAeronave ? 'Salvar Alterações' : 'Cadastrar Aeronave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
