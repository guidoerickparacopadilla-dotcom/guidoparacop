const Groq = require('groq-sdk');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { message, niche, context, visitorProfile, history = [] } = JSON.parse(event.body || '{}');

    if (!message || typeof message !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Mensaje vacío' }) };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: null,
          fallback: true,
          error: 'GROQ_API_KEY no está configurada en variables de entorno.'
        })
      };
    }

    const groq = new Groq({ apiKey });

    const systemPrompt = `Eres el Agente IA de demostración de Guido Paraco, Growth Partner en Medellín, Colombia.
Tu misión es conversar de forma natural con visitantes de una landing, como si fueras el agente IA del negocio seleccionado.

Contexto de marca:
- Guido Paraco construye sistemas completos de captación, conversión y retención con IA, CRM, Meta Ads, WhatsApp, automatización y remarketing.
- No vende tareas aisladas; vende sistemas comerciales.

Nicho activo: ${niche || 'general'}.
Contexto del nicho: ${JSON.stringify(context || {})}.
Perfil detectado del visitante: ${JSON.stringify(visitorProfile || {})}.

Reglas de conversación:
1. Responde en español claro, natural y comercial. Tono cercano, colombiano neutro.
2. No respondas como menú rígido. Conversa fluidamente.
3. Máximo 90 palabras por respuesta.
4. Haz máximo 1 o 2 preguntas concretas por turno.
5. Si el usuario quiere precio, explica que primero debes entender el caso para orientar bien.
6. Si el usuario quiere agendar, pide nombre, WhatsApp y horario preferido.
7. Si el nicho es médico, legal o financiero, no prometas resultados; recomienda valoración o consulta profesional.
8. Cuando corresponda, muestra que el sistema detrás puede registrar en CRM, activar seguimiento y pasar el lead a WhatsApp.
9. Tu objetivo no es cerrar agresivamente; es calificar, orientar y llevar al siguiente paso.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 800)
      })),
      { role: 'user', content: message.slice(0, 1200) }
    ];

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages,
      temperature: 0.65,
      max_tokens: 220
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply,
        score: 78,
        stage: 3,
        stageLabel: 'Respuesta generada por Groq IA',
        crmState: 'Lead en conversación',
        priority: 'Alta',
        nextAction: 'Continuar calificando o agendar'
      })
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: null, fallback: true, error: error.message })
    };
  }
};
