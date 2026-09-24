exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  const json = (statusCode, body) => ({
    statusCode,
    headers,
    body: JSON.stringify(body)
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

  // DIAGNÓSTICO DIRECTO
  // Permite abrir la URL de la función en el navegador
  // y comprobar Groq sin usar DevTools.
  if (event.httpMethod === 'GET') {
    if (!apiKey) {
      return json(500, {
        ok: false,
        model,
        error: 'GROQ_API_KEY no está configurada en Netlify.'
      });
    }

    try {
      const probeResponse = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: 'Responde únicamente con la palabra OK.'
              }
            ],
            temperature: 0.5,
            max_completion_tokens: 64,
            reasoning_effort: 'low',
            include_reasoning: false,
            stream: false
          })
        }
      );

      const probeData = await probeResponse.json().catch(() => ({}));

      if (!probeResponse.ok) {
        const upstreamError =
          probeData?.error?.message ||
          probeData?.message ||
          `Groq respondió HTTP ${probeResponse.status}`;

        console.error('GROQ_HEALTH_ERROR', {
          status: probeResponse.status,
          model,
          error: upstreamError
        });

        return json(502, {
          ok: false,
          model,
          groqStatus: probeResponse.status,
          error: upstreamError
        });
      }

      return json(200, {
        ok: true,
        model,
        groq: 'connected'
      });
    } catch (error) {
      console.error('GROQ_HEALTH_EXCEPTION', error);

      return json(502, {
        ok: false,
        model,
        error: error?.message || 'Error desconocido conectando con Groq.'
      });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, {
      error: 'Method not allowed'
    });
  }

  try {
    if (!apiKey) {
      return json(500, {
        reply: null,
        fallback: true,
        error: 'GROQ_API_KEY no está configurada en Netlify.'
      });
    }

    let body = {};

    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, {
        reply: null,
        fallback: true,
        error: 'El cuerpo de la solicitud no es JSON válido.'
      });
    }

    const {
      message,
      niche,
      context,
      visitorProfile = {},
      history = []
    } = body;

    if (!message || typeof message !== 'string') {
      return json(400, {
        reply: null,
        fallback: true,
        error: 'Mensaje vacío.'
      });
    }

    const normalizedMessage = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const hasImplementationIntent =
      /\b(me interesa|quiero esto|cuanto cuesta|precio|cotiz|implementar|implementarlo|contratar|hablar con guido|contactar a guido|agenda|agendar|quiero una llamada|lo necesito para mi negocio|como empezamos|empecemos)\b/i.test(
        normalizedMessage
      );

    const hasDirectContactIntent =
      /\b(mi whatsapp|mi numero es|te dejo mi numero|hablar por whatsapp|pasar a whatsapp|contactame)\b/i.test(
        normalizedMessage
      );

    const recommendedMode =
      hasImplementationIntent || hasDirectContactIntent
        ? 'INTERES_EN_IMPLEMENTAR'
        : 'DEMOSTRACION';

    // El nicho detectado en la conversación tiene prioridad
    // sobre el nicho por defecto de la interfaz.
    const effectiveNiche =
      visitorProfile?.nicho ||
      niche ||
      'general';

    const detectedBusiness =
      visitorProfile?.tipoNegocio || '';

    const detectedCity =
      visitorProfile?.city || '';

    const instructions = `
Eres el agente IA de Guido Paraco, Growth Partner IA en Medellín, Colombia.

OBJETIVO

Esta web muestra una demo viva de cómo un agente IA puede atender, filtrar y convertir clientes de un negocio real.

Debes demostrar valor y, cuando exista intención comercial real, calificar al prospecto y llevarlo hacia Guido.

MODO DE ESTE TURNO

${recommendedMode}

REGLAS

- No vendas agresivamente si el visitante solo está explorando.
- Si está explorando, demuestra cómo funcionaría el agente para SU negocio.
- Si pide precio, implementación, cotización, agenda o hablar con Guido, pasa a modo comercial suave.
- No inventes precios.
- No prometas resultados garantizados.
- Pide solo el dato faltante más importante.
- Haz máximo una pregunta al final.
- Máximo 75 palabras, salvo que el usuario pida detalle.
- Español natural, cercano y profesional.
- Tono colombiano neutro.
- No hables como robot.
- No repitas información que ya esté en el historial o perfil.
- El negocio y nicho detectados en el mensaje o perfil tienen prioridad sobre cualquier nicho por defecto de la interfaz.
- NUNCA conviertas una clínica estética en clínica odontológica por un valor predeterminado.
- Si el usuario corrige un dato, usa el dato más reciente y descarta el anterior.
- No digas que el CRM guardó datos si el sistema no lo confirmó.

DEMOSTRACIÓN

Cuando el usuario mencione su negocio:

1. Reconoce correctamente el negocio.
2. Explica brevemente qué podría hacer el agente.
3. Haz una sola pregunta o invita a simular una conversación.

Ejemplo:

"Perfecto. Para una clínica estética en Medellín, el agente podría filtrar pacientes por tratamiento, intención, horario y datos de contacto antes de pasarlos al equipo. Probemos: escríbeme como si fueras una paciente preguntando por una cita."

INTERÉS EN IMPLEMENTAR

Si existe intención comercial:

- Explica brevemente que el alcance depende del negocio, canales y sistema requerido.
- Captura progresivamente nombre, WhatsApp, ciudad, negocio, necesidad y urgencia.
- No vuelvas a pedir información que ya tienes.
- Si ya dejó WhatsApp o pidió hablar con Guido, orienta el cierre hacia WhatsApp.

CAPACIDADES DE GUIDO

Guido trabaja con:

- Agentes IA
- Automatización
- CRM
- Meta Ads
- WhatsApp
- Embudos
- Seguimiento comercial
- Adquisición
- Conversión
- Retención

Guido construye sistemas conectados, no solamente tareas aisladas.

GUÍA POR NICHO

Clínica estética:
tratamiento, valoración, intención, horario, ciudad, confianza y WhatsApp.

Odontología:
tratamiento, dolor o urgencia, valoración, horario, ciudad y WhatsApp.

Inmobiliaria:
compra o arriendo, zona, presupuesto, inmueble e intención.

E-commerce:
producto, dudas, pagos, envíos, carrito y recompra.

Restaurante:
reservas, pedidos, horarios, eventos y recurrencia.

Gimnasio:
objetivo, horarios, prueba, inscripción y seguimiento.

Veterinaria:
mascota, síntoma, urgencia, cita y recordatorios.

Concesionario:
modelo, presupuesto, financiación, retoma y test drive.

Peluquería:
servicio, horario, valoración, color y recordatorios.

Abogados:
área legal, ciudad, urgencia y documentos.
No des asesoría legal definitiva.

CONTEXTO ACTUAL

Nicho efectivo:
${effectiveNiche}

Negocio detectado:
${detectedBusiness || 'no detectado todavía'}

Ciudad detectada:
${detectedCity || 'no detectada todavía'}

Contexto recibido de la interfaz:
${JSON.stringify(context || {})}

Perfil detectado:
${JSON.stringify(visitorProfile || {})}
`;

    const safeHistory = Array.isArray(history)
      ? history.slice(-10).map((item) => ({
          role:
            item?.role === 'assistant'
              ? 'assistant'
              : 'user',
          content: String(
            item?.content || ''
          ).slice(0, 1000)
        }))
      : [];

    const messages = [
      {
        role: 'user',
        content:
          `INSTRUCCIONES DEL AGENTE:\n${instructions}`
      },
      ...safeHistory,
      {
        role: 'user',
        content: message.slice(0, 1500)
      }
    ];

    const groqResponse = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.6,
          max_completion_tokens: 512,
          reasoning_effort: 'low',
          include_reasoning: false,
          stream: false
        })
      }
    );

    const completion =
      await groqResponse.json().catch(() => ({}));

    if (!groqResponse.ok) {
      const upstreamError =
        completion?.error?.message ||
        completion?.message ||
        `Groq respondió HTTP ${groqResponse.status}`;

      console.error('GROQ_CHAT_ERROR', {
        status: groqResponse.status,
        model,
        error: upstreamError
      });

      return json(502, {
        reply: null,
        fallback: true,
        model,
        groqStatus: groqResponse.status,
        error: upstreamError
      });
    }

    const reply =
      completion?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.error(
        'GROQ_EMPTY_REPLY',
        JSON.stringify(completion)
      );

      return json(502, {
        reply: null,
        fallback: true,
        model,
        error:
          'Groq respondió, pero no devolvió contenido utilizable.'
      });
    }

    const baseScore =
      Number(visitorProfile?.leadScore) || 12;

    const score = Math.min(
      100,
      Math.max(
        baseScore,
        recommendedMode ===
          'INTERES_EN_IMPLEMENTAR'
          ? 72
          : 35
      )
    );

    return json(200, {
      reply,
      model,
      effectiveNiche,
      score,

      stage:
        recommendedMode ===
        'INTERES_EN_IMPLEMENTAR'
          ? 3
          : 2,

      stageLabel:
        recommendedMode ===
        'INTERES_EN_IMPLEMENTAR'
          ? 'Interés comercial detectado'
          : 'Demo de agente IA por nicho',

      crmState:
        'Lead en conversación',

      priority:
        recommendedMode ===
        'INTERES_EN_IMPLEMENTAR'
          ? 'Alta'
          : 'Media',

      nextAction:
        recommendedMode ===
        'INTERES_EN_IMPLEMENTAR'
          ? 'Calificar datos faltantes y llevar a WhatsApp'
          : 'Demostrar funcionamiento del agente'
    });

  } catch (error) {
    console.error(
      'CHAT_AGENT_FATAL_ERROR',
      error
    );

    return json(500, {
      reply: null,
      fallback: true,
      model,
      error:
        error?.message ||
        'Error interno desconocido en chat-agent.'
    });
  }
};
