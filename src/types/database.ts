// Tipos do banco no formato do `supabase gen types typescript`.
// Após alterar migrations, regenere com `npm run gen:types` (gera database.gen.ts)
// e substitua este arquivo pelo gerado, se preferir.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ChamadoRow = {
  id: string;
  numero: string;
  aberto_em: string;
  tipo: string;
  setor_origem_id: string;
  leito_origem: string | null;
  setor_destino_id: string | null;
  destino_outro: string | null;
  leito_destino: string | null;
  paciente: string | null;
  origem_chamado: string;
  solicitante: string | null;
  recurso: string;
  precisa_isolamento: boolean;
  precisa_oxigenio: boolean;
  prioridade: string;
  observacao: string | null;
  status: string;
  maqueiro_id: string | null;
  maqueiro_informado_em: string | null;
  inicio_atendimento_em: string | null;
  encerrado_em: string | null;
  motivo_atraso: string | null;
  motivo_atraso_texto: string | null;
  cancelado_em: string | null;
  cancelado_motivo: string | null;
  cancelado_por: string | null;
  criado_por: string | null;
  encerrado_por: string | null;
  despacho_reiniciado_em: string | null;
  despacho_esgotado_em: string | null;
  created_at: string;
};

type OfertaRow = {
  id: string; chamado_id: string; maqueiro_id: string; enviada_em: string; expira_em: string;
  status: 'pendente' | 'aceita' | 'recusada' | 'expirada' | 'cancelada'; respondida_em: string | null;
  justificativa: string | null; urgente: boolean;
};
type JornadaRow = {
  id: string; maqueiro_id: string; inicio: string; fim: string | null; lat: number | null; lng: number | null;
  precisao_m: number | null; distancia_m: number | null; encerrada_por: string | null; created_at: string;
};

type MetricaExtra = {
  setor_origem_nome: string;
  setor_destino_nome: string | null;
  maqueiro_nome: string | null;
  data_local: string;
  hora: number;
  dia_semana: number;
  turno: string;
  min_acionamento: number | null;
  min_acionamento_atendimento: number | null;
  min_total: number | null;
  sla_minutos: number;
  atrasado: boolean;
  grupo_motivo_atraso: string | null;
};

type EventoRow = {
  id: number;
  chamado_id: string | null;
  entidade: string;
  entidade_id: string | null;
  em: string;
  usuario: string | null;
  acao: string;
  campo: string | null;
  valor_antigo: string | null;
  valor_novo: string | null;
  justificativa: string | null;
};

type Tabela<R, I = Partial<R>> = { Row: R; Insert: I; Update: Partial<R>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      setores: Tabela<{ id: string; nome: string; ativo: boolean; exige_leito: boolean; ordem: number; created_at: string }>;
      perfis: Tabela<{
        id: string; usuario: string; papel: string; setor_id: string | null; nome: string; ativo: boolean;
        aprovado_em: string | null; aprovado_por: string | null; maqueiro_id: string | null; created_at: string;
      }>;
      maqueiros: Tabela<{
        id: string; nome: string; matricula: string | null; turno: string; horario_inicio: string; horario_fim: string;
        setor_atuacao: string; ativo: boolean; em_intervalo: boolean; created_at: string;
      }>;
      escala_dias: Tabela<{ id: string; maqueiro_id: string; data: string; tipo: string; created_at: string }>;
      habilitacoes: Tabela<{
        id: string; maqueiro_id: string; data: string; hora_inicio: string; hora_fim: string; motivo: string;
        observacao: string | null; criado_por: string | null; criado_em: string; removido_em: string | null; removido_por: string | null;
      }>;
      indisponibilidades: Tabela<{
        id: string; maqueiro_id: string; tipo: string; justificativa: string; inicio: string; fim: string | null;
        criado_por: string | null; encerrado_por: string | null; created_at: string;
      }>;
      chamados: Tabela<ChamadoRow>;
      ofertas: Tabela<OfertaRow>;
      jornadas: Tabela<JornadaRow>;
      intervalos: Tabela<{
        id: string; maqueiro_id: string; inicio: string; fim: string | null; criado_por: string | null;
        encerrado_por: string | null; created_at: string;
      }>;
      chamado_eventos: Tabela<EventoRow>;
      configuracoes: Tabela<{ chave: string; valor: Json }, { chave: string; valor: Json }>;
      sequencia_chamados: Tabela<{ ano: number; n: number }>;
    };
    Views: {
      vw_chamados_metricas: { Row: ChamadoRow & MetricaExtra; Relationships: [] };
      vw_demanda_hora: {
        Row: {
          data_local: string; hora: number; chamados: number; concluidos: number; cancelados: number; atrasados: number;
          tempo_medio_min: number | null; acionamento_medio_min: number | null;
        };
        Relationships: [];
      };
      vw_historico: { Row: EventoRow & { chamado_numero: string | null }; Relationships: [] };
      vw_ofertas: {
        Row: OfertaRow & { maqueiro_nome: string; chamado_numero: string; data_local: string; hora: number; segundos_resposta: number | null };
        Relationships: [];
      };
      vw_jornadas: {
        Row: JornadaRow & { maqueiro_nome: string; data_local: string; em_andamento: boolean; horas: number };
        Relationships: [];
      };
      vw_intervalos: {
        Row: {
          id: string; maqueiro_id: string; maqueiro_nome: string; inicio: string; fim: string | null;
          criado_por: string | null; encerrado_por: string | null; data_local: string; hora: number;
          em_andamento: boolean; minutos: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      agora_servidor: { Args: Record<string, never>; Returns: string };
      app_maqueiro_estado: { Args: Record<string, never>; Returns: Json };
      processar_despacho: { Args: Record<string, never>; Returns: number };
      iniciar_jornada: { Args: { p_lat: number; p_lng: number; p_precisao?: number | null }; Returns: JornadaRow };
      encerrar_jornada: { Args: { p_maqueiro_id?: string | null }; Returns: undefined };
      aceitar_oferta: { Args: { p_oferta_id: string }; Returns: ChamadoRow };
      recusar_oferta: { Args: { p_oferta_id: string; p_justificativa: string }; Returns: undefined };
      redistribuir_chamado: { Args: { p_chamado_id: string }; Returns: undefined };
      papel_atual: { Args: Record<string, never>; Returns: string };
      abrir_chamado: {
        Args: {
          p_tipo: string; p_setor_origem_id: string; p_leito_origem?: string | null; p_setor_destino_id?: string | null;
          p_destino_outro?: string | null; p_leito_destino?: string | null; p_paciente?: string | null;
          p_origem_chamado?: string; p_solicitante?: string | null; p_recurso?: string; p_precisa_isolamento?: boolean;
          p_precisa_oxigenio?: boolean; p_prioridade?: string; p_observacao?: string | null; p_aberto_em?: string | null;
          p_justificativa_hora?: string | null;
        };
        Returns: ChamadoRow;
      };
      acionar_maqueiro: {
        Args: { p_chamado_id: string; p_maqueiro_id: string; p_informado_em?: string | null; p_justificativa?: string | null };
        Returns: ChamadoRow;
      };
      mudar_status: { Args: { p_chamado_id: string; p_status: string }; Returns: ChamadoRow };
      encerrar_chamado: {
        Args: { p_chamado_id: string; p_motivo_atraso?: string | null; p_motivo_atraso_texto?: string | null };
        Returns: ChamadoRow;
      };
      cancelar_chamado: { Args: { p_chamado_id: string; p_justificativa: string }; Returns: ChamadoRow };
      corrigir_chamado: {
        Args: { p_chamado_id: string; p_campo: string; p_valor: string | null; p_justificativa: string };
        Returns: ChamadoRow;
      };
      painel_maqueiros: {
        Args: Record<string, never>;
        Returns: {
          maqueiro_id: string; nome: string; matricula: string | null; turno: string; setor_atuacao: string;
          horario_inicio: string; horario_fim: string; em_plantao: boolean; turno_inicio: string | null; turno_fim: string | null;
          fonte: string | null; tipo_escala: string | null; habilitacao_id: string | null; em_intervalo: boolean;
          indisponibilidade_id: string | null; indisponibilidade_tipo: string | null; indisponibilidade_justificativa: string | null;
          situacao: string; chamados_ativos: number; chamado_atual_numero: string | null; chamado_atual_status: string | null;
          disponivel_para_acionar: boolean; escala_mes_cadastrada: boolean;
          intervalo_inicio: string | null; intervalos_hoje: number; intervalo_min_hoje: number;
        }[];
      };
      habilitar_maqueiro: {
        Args: {
          p_maqueiro_id: string; p_hora_inicio?: string | null; p_hora_fim?: string | null; p_motivo?: string;
          p_observacao?: string | null; p_data?: string | null;
        };
        Returns: string;
      };
      desabilitar_maqueiro: { Args: { p_habilitacao_id: string }; Returns: undefined };
      marcar_indisponivel: { Args: { p_maqueiro_id: string; p_tipo: string; p_justificativa: string }; Returns: string };
      disponibilizar_maqueiro: { Args: { p_maqueiro_id: string }; Returns: undefined };
      definir_intervalo: { Args: { p_maqueiro_id: string; p_em_intervalo: boolean }; Returns: undefined };
      definir_escala_dia: { Args: { p_maqueiro_id: string; p_data: string; p_tipo: string | null }; Returns: undefined };
      importar_escala: { Args: { p_linhas: Json; p_mes?: string | null }; Returns: number };
      capacidade_dia: {
        Args: { p_data: string };
        Returns: {
          hora: number; inicio: string; capacidade_calculada: number; capacidade_manual: number | null; capacidade: number;
          chamados_abertos: number; demanda_pico: number; deficit: boolean;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type T = Database['public']['Tables'];
export type Setor = T['setores']['Row'];
export type Perfil = T['perfis']['Row'];
export type Maqueiro = T['maqueiros']['Row'];
export type EscalaDia = T['escala_dias']['Row'];
export type Habilitacao = T['habilitacoes']['Row'];
export type Indisponibilidade = T['indisponibilidades']['Row'];
export type Chamado = ChamadoRow;
export type ChamadoMetrica = Database['public']['Views']['vw_chamados_metricas']['Row'];
export type Evento = Database['public']['Views']['vw_historico']['Row'];
export type Oferta = Database['public']['Views']['vw_ofertas']['Row'];
export type Jornada = Database['public']['Views']['vw_jornadas']['Row'];
export type IntervaloRegistro = Database['public']['Views']['vw_intervalos']['Row'];
export type PainelMaqueiro = Database['public']['Functions']['painel_maqueiros']['Returns'][number];
export type CapacidadeHora = Database['public']['Functions']['capacidade_dia']['Returns'][number];
