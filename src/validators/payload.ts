import { z } from 'zod';

export const PublishPayloadSchema = z.object({
  titulo: z.string().min(1),
  materia: z.string().min(1),
  semestre: z.number().int().min(1).max(10),
  resumo: z.string().min(1),
  topicos: z.array(
    z.object({
      titulo: z.string(),
      conteudo: z.string(),
      macete: z.string().optional(),
    })
  ),
  tabela: z.array(z.record(z.string())).optional(),
  mapa_mental_url: z.string().url().optional(),
});

export type PublishPayload = z.infer<typeof PublishPayloadSchema>;