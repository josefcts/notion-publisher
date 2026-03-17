import { z } from 'zod';

const ImagemSchema = z.object({
  url: z.string().url(),
  legenda: z.string().optional(),
});

const TopicoSchema = z.object({
  titulo: z.string(),
  conteudo: z.string(),
  macete: z.string().optional(),
  imagens: z.array(ImagemSchema).optional(),
});

export const PublishPayloadSchema = z.object({
  titulo: z.string(),
  materia: z.string(),
  semestre: z.number().int().min(1).max(10),
  resumo: z.string(),
  diagrama: z.string().optional(),
  mapa_mental: z.string().optional(),
  topicos: z.array(TopicoSchema),
  tabela: z.array(z.record(z.string())).optional(),
  pontos_de_prova: z.array(z.string()).optional(),
  conexoes: z.object({
    passado: z.string().optional(),
    futuro: z.string().optional(),
  }).optional(),
});

export type PublishPayload = z.infer<typeof PublishPayloadSchema>;