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

function buildNotionBlocks(payload: PublishPayload): any[] {
  const blocks: any[] = [];
  blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: payload.titulo } }] } });
  blocks.push({ object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: `Gerado em ${new Date().toLocaleDateString('pt-BR')} • ${payload.materia}` } }], icon: { type: 'emoji', emoji: '📅' }, color: 'blue_background' } });
  blocks.push({ object: 'block', type: 'divider', divider: {} });
  blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📝 Resumo Geral' } }] } });
  blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: payload.resumo } }] } });
  blocks.push({ object: 'block', type: 'divider', divider: {} });
  blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📚 Tópicos' } }] } });
  for (const topico of payload.topicos) {
    blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: topico.titulo } }] } });
    blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: topico.conteudo } }] } });
    if (topico.macete) {
      blocks.push({ object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: `💡 Macete: ${topico.macete}` } }], icon: { type: 'emoji', emoji: '💡' }, color: 'yellow_background' } });
    }
  }
  if (payload.tabela && payload.tabela.length > 0) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📊 Tabela Comparativa' } }] } });
    const headers = Object.keys(payload.tabela[0]);
    blocks.push({ object: 'block', type: 'table', table: { table_width: headers.length, has_column_header: true, has_row_header: false, children: [{ object: 'block', type: 'table_row', table_row: { cells: headers.map(h => [{ type: 'text', text: { content: h } }]) } }, ...payload.tabela.map(row => ({ object: 'block', type: 'table_row', table_row: { cells: headers.map(h => [{ type: 'text', text: { content: row[h] ?? '' } }]) } }))] } });
  }
  if (payload.mapa_mental_url) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '🗺️ Mapa Mental' } }] } });
    blocks.push({ object: 'block', type: 'image', image: { type: 'external', external: { url: payload.mapa_mental_url } } });
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

    const page = await notion.pages.create({
      parent: { page_id: materiaPageId },
      properties: { title: { title: [{ text: { content: payload.titulo } }] } },
      icon: { type: 'emoji', emoji: '📄' },
      children: buildNotionBlocks(payload),
    });
    return page.url;
  } catch (err: any) {
    throw new NotionError(`Falha ao publicar no Notion: ${err.message}`);
  }
}