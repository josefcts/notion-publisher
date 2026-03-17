import { Client, isFullBlock } from '@notionhq/client';
import { NotionError } from '../errors';
import { PublishPayload } from '../validators/payload';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SEMESTER_ICONS: Record<number, string> = {
  1: '📗', 2: '📘', 3: '📙', 4: '📕', 5: '📒',
  6: '📔', 7: '📓', 8: '📃', 9: '📄', 10: '🎓',
};

const MATERIA_ICONS: Record<string, string> = {
  'Fisiopatologia dos Principais Agravos à Saúde II': '🦠',
  'Fisiopatologia dos Principais Agravos à Saúde I': '🫀',
  'Treinamento de Habilidades Odontológicas II': '🔧',
  'Treinamento de Habilidades Odontológicas III': '🔧',
  'Estágio de Prevenção e Prática Clínica II': '🏫',
  'Estágio de Clínica Odontológica': '🏥',
  'Homem, Cultura e Sociedade': '🌍',
  'Farmacoterapia Odontológica': '💊',
  'Patologia Geral': '🔬',
  'Anatomia Humana': '🦴',
};

async function getOrCreatePage(parentId: string, title: string, icon?: string): Promise<string> {
  const children = await notion.blocks.children.list({ block_id: parentId });
  for (const block of children.results) {
    if (isFullBlock(block) && block.type === 'child_page' && block.child_page.title === title) {
      return block.id;
    }
  }
  const pageBody: any = {
    parent: { page_id: parentId },
    properties: { title: { title: [{ text: { content: title } }] } },
  };
  if (icon) pageBody.icon = { type: 'emoji', emoji: icon };
  const newPage = await notion.pages.create(pageBody);
  return newPage.id;
}

// Busca se a página já existe pelo título dentro de uma matéria
async function findExistingPage(materiaPageId: string, titulo: string): Promise<string | null> {
  const children = await notion.blocks.children.list({ block_id: materiaPageId });
  for (const block of children.results) {
    if (isFullBlock(block) && block.type === 'child_page' && block.child_page.title === titulo) {
      return block.id;
    }
  }
  return null;
}

function buildBlocks(payload: PublishPayload): any[] {
  const blocks: any[] = [];

  // Callout de contexto
  blocks.push({
    object: 'block', type: 'callout',
    callout: {
      rich_text: [{ type: 'text', text: { content: `📅 Publicado em ${new Date().toLocaleDateString('pt-BR')} • ${payload.materia} • ${payload.semestre}º Semestre` } }],
      icon: { type: 'emoji', emoji: '📌' }, color: 'blue_background'
    }
  });

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // Resumo geral
  blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📝 Resumo Geral' } }] } });
  blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: payload.resumo } }] } });

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // Tópicos
  blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📚 Tópicos' } }] } });

  for (const topico of payload.topicos) {
    // Título do tópico
    blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: topico.titulo } }] } });

    // Conteúdo
    blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: topico.conteudo } }] } });

    // Imagens — aparecem logo após o conteúdo do tópico
    if (topico.imagens?.length) {
      for (const img of topico.imagens) {
        blocks.push({
          object: 'block', type: 'image',
          image: { type: 'external', external: { url: img.url }, caption: img.legenda ? [{ type: 'text', text: { content: img.legenda } }] : [] }
        });
      }
    }

    // Macete em callout amarelo
    if (topico.macete) {
      blocks.push({
        object: 'block', type: 'callout',
        callout: {
          rich_text: [{ type: 'text', text: { content: `💡 Macete: ${topico.macete}` }, annotations: { bold: true } }],
          icon: { type: 'emoji', emoji: '💡' }, color: 'yellow_background'
        }
      });
    }
  }

  // Tabela comparativa
  if (payload.tabela?.length) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📊 Tabela Comparativa' } }] } });

    const headers = Object.keys(payload.tabela[0]);
    const tableRows = [
      // Header row
      {
        object: 'block', type: 'table_row',
        table_row: { cells: headers.map(h => [{ type: 'text', text: { content: h }, annotations: { bold: true } }]) }
      },
      // Data rows
      ...payload.tabela.map(row => ({
        object: 'block', type: 'table_row',
        table_row: { cells: headers.map(h => [{ type: 'text', text: { content: String(row[h] ?? '') } }]) }
      }))
    ];

    blocks.push({
      object: 'block', type: 'table',
      table: { table_width: headers.length, has_column_header: true, has_row_header: false, children: tableRows }
    });
  }

  // Pontos de prova
  if (payload.pontos_de_prova?.length) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '⚠️ Pontos de Prova' } }] } });
    for (const ponto of payload.pontos_de_prova) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: ponto } }] } });
    }
  }

  // Conexões curriculares
  if (payload.conexoes) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '🔗 Conexões Curriculares' } }] } });
    if (payload.conexoes.passado) {
      blocks.push({ object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: `📖 Do passado: ${payload.conexoes.passado}` } }], icon: { type: 'emoji', emoji: '📖' }, color: 'gray_background' } });
    }
    if (payload.conexoes.futuro) {
      blocks.push({ object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: `🚀 Para o futuro: ${payload.conexoes.futuro}` } }], icon: { type: 'emoji', emoji: '🚀' }, color: 'green_background' } });
    }
  }

  return blocks;
}

export async function publishToNotion(payload: PublishPayload): Promise<string> {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) throw new NotionError('NOTION_ROOT_PAGE_ID nao configurado');

  try {
    const semIcon = SEMESTER_ICONS[payload.semestre] || '📁';
    const semTitle = `${payload.semestre}º Semestre`;
    const materiaIcon = MATERIA_ICONS[payload.materia] || '📖';

    const semesterPageId = await getOrCreatePage(rootPageId, semTitle, semIcon);
    const materiaPageId = await getOrCreatePage(semesterPageId, payload.materia, materiaIcon);

    const blocks = buildBlocks(payload);
    const chunkSize = 50;

    // Verifica se página já existe
    const existingId = await findExistingPage(materiaPageId, payload.titulo);

    if (existingId) {
      // Página existe: deleta todos os blocos e reescreve
      const existingBlocks = await notion.blocks.children.list({ block_id: existingId });
      for (const b of existingBlocks.results) {
        try { await notion.blocks.delete({ block_id: b.id }); } catch {}
      }
      for (let i = 0; i < blocks.length; i += chunkSize) {
        await notion.blocks.children.append({ block_id: existingId, children: blocks.slice(i, i + chunkSize) });
      }
      const page = await notion.pages.retrieve({ page_id: existingId }) as any;
      return page.url;
    } else {
      // Página nova: cria com os blocos
      const firstChunk = blocks.slice(0, chunkSize);
      const page = await notion.pages.create({
        parent: { page_id: materiaPageId },
        properties: { title: { title: [{ text: { content: payload.titulo } }] } },
        icon: { type: 'emoji', emoji: '📄' },
        children: firstChunk,
      }) as any;

      // Chunks restantes
      for (let i = chunkSize; i < blocks.length; i += chunkSize) {
        await notion.blocks.children.append({ block_id: page.id, children: blocks.slice(i, i + chunkSize) });
      }

      return page.url;
    }
  } catch (err: any) {
    throw new NotionError(`Falha ao publicar no Notion: ${err.message}`);
  }
}