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

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  if (event.httpMethod === 'GET') {
    if (!apiKey) {
      return json(500, {
        ok: false,
        model,
        error: 'GROQ_API_KEY no está configurada en Netlify.'
      });
    }

    try {
      const response = await fetch(
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
                content: 'Responde solamente con OK.'
              }
            ],
            temperature: 0.5,
            max_completion_tokens: 64,
            reasoning_effort: 'low',
            reasoning_format: 'hidden',
            stream: false
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          data?.error?.message ||
          data?.message ||
          `Groq respondió HTTP ${response.status}`;

        console.error('GROQ_HEALTH_ERROR', {
          status: response.status,
          model,
          error: errorMessage
        });

        return json(502, {
          ok: false,
          model,
          groqStatus: response.status,
          error: errorMessage
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
        error: error?.message || 'Error desconocido.'
      });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, {
      error: 'Method not allowed'
    });
  }

  // ==========================================
  // HELPERS
  // ==========================================

  const cleanString = (value, max = 500) => {
    if (typeof value !== 'string') return '';

    return value
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  };

  const normalizePhone = (value) => {
    const raw = cleanString(value, 40);

    if (!raw) return '';

    const digits = raw.replace(/\D/g, '');

    if (digits.startsWith('57') && digits.length === 12) {
      return `+${digits}`;
    }

    if (digits.length === 10 && digits.startsWith('3')) {
      return `+57${digits}`;
    }

    return raw;
  };

  const calculateScore = (prospect) => {
    let score = 0;

    if (prospect.name) score += 10;
    if (prospect.whatsapp) score += 20;
    if (prospect.city) score += 10;
    if (prospect.businessType) score += 15;
    if (prospect.niche) score += 5;
    if (prospect.need) score += 20;

    if (prospect.urgency === 'Alta') score += 10;
    else if (prospect.urgency === 'Media') score += 5;

    if (prospect.implementationIntent) score += 5;
    if (prospect.wantsGuido) score += 5;

    return Math.min(score, 100);
  };

  const calculateState = (prospect, score) => {
    if (
      prospect.whatsapp &&
      prospect.businessType &&
      prospect.need &&
      (prospect.implementationIntent || prospect.wantsGuido)
    ) {
      return 'Listo para contacto';
    }

    if (score >= 65) {
      return 'Lead calificado';
    }

    if (
      prospect.businessType ||
      prospect.need ||
      prospect.city
    ) {
      return 'Lead en conversación';
    }

    return 'Explorando';
  };

  const getNextMissingField = (prospect) => {
    if (!prospect.businessType) return 'tipo de negocio';
    if (!prospect.need) return 'necesidad principal';
    if (!prospect.city) return 'ciudad';

    if (
      prospect.implementationIntent ||
      prospect.wantsGuido
    ) {
      if (!prospect.name) return 'nombre';
      if (!prospect.whatsapp) return 'WhatsApp';
      if (!prospect.urgency) return 'urgencia';
    }

    return '';
  };

  // ==========================================
  // MAIN
  // ==========================================

  try {
    if (!apiKey) {
      return json(500, {
        reply: null,
        fallback: true,
        error: 'GROQ_API_KEY no está configurada.'
      });
    }

    let body = {};

    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, {
        reply: null,
        fallback: true,
        error: 'JSON inválido.'
      });
    }

    const {
      message,
      niche = '',
      context = {},
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

    const currentMessage = cleanString(message, 1800);

    // ==========================================
    // HISTORIAL
    // Evita duplicar el mensaje actual.
    // ==========================================

    let safeHistory = Array.isArray(history)
      ? history
          .slice(-12)
          .map((item) => ({
            role:
              item?.role === 'assistant'
                ? 'assistant'
                : 'user',
            content: cleanString(item?.content, 1200)
          }))
          .filter((item) => item.content)
      : [];

    if (safeHistory.length) {
      const last = safeHistory[safeHistory.length - 1];

      if (
        last.role === 'user' &&
        last.content.toLowerCase() ===
          currentMessage.toLowerCase()
      ) {
        safeHistory.pop();
      }
    }

    // ==========================================
    // PERFIL PREVIO
    // Es una pista, NO una verdad absoluta.
    // ==========================================

    const previousProfile = {
      name: cleanString(visitorProfile?.name, 100),
      whatsapp: normalizePhone(visitorProfile?.phone),
      city: cleanString(visitorProfile?.city, 100),
      businessType: cleanString(
        visitorProfile?.tipoNegocio,
        150
      ),
      niche: cleanString(visitorProfile?.nicho, 80),
      need: cleanString(visitorProfile?.need, 300),
      urgency: cleanString(
        visitorProfile?.urgency,
        30
      )
    };

    // ==========================================
    // PROMPT MAESTRO
    // ==========================================

    const instructions = `
Eres el agente IA comercial de Guido Paraco.

Tu función tiene DOS CAPAS simultáneas y debes mantenerlas perfectamente separadas.

==================================================
CAPA 1 — EXPERIENCIA VISIBLE: DEMOSTRACIÓN
==================================================

El visitante debe sentir que está probando cómo funcionaría un agente IA dentro de un negocio.

Debes:

- entender lo que dice;
- responder con contexto;
- demostrar cómo atenderías, filtrarías o convertirías clientes;
- mantener una conversación natural;
- hacer máximo UNA pregunta por respuesta;
- evitar interrogatorios;
- evitar vender agresivamente;
- demostrar valor antes de pedir datos de contacto.

La demostración NO debe sonar como:
"Estoy recopilando información para el CRM".

Nunca menciones procesos internos, extracción de datos, JSON, variables, scoring o CRM salvo que sea relevante para explicar el servicio de Guido.

==================================================
CAPA 2 — PROCESO INVISIBLE: CALIFICACIÓN
==================================================

Mientras conversas debes construir silenciosamente el perfil REAL del prospecto.

Campos:

- nombre
- WhatsApp
- ciudad
- tipo real de negocio
- nicho
- necesidad comercial principal
- urgencia
- intención de implementar
- deseo de hablar con Guido

Debes extraer esos datos SOLO cuando estén respaldados por lo que el visitante realmente haya dicho.

==================================================
REGLA CRÍTICA: DEMO ≠ NEGOCIO REAL
==================================================

Distingue estrictamente entre:

A) NEGOCIO REAL DEL PROSPECTO

Ejemplos:

"Yo tengo una clínica estética."
"Manejo un restaurante en Envigado."
"Mi empresa vende por Shopify."

Eso SÍ puede convertirse en datos del perfil.

B) EJEMPLO / SIMULACIÓN / PRUEBA

Ejemplos:

"Muéstrame cómo sería para un restaurante."
"Probemos con una clínica."
"Supongamos que tengo una inmobiliaria."
"Haz de cuenta que soy odontólogo."

Eso NO demuestra que ese sea su negocio real.

No contamines el perfil real con datos usados solamente para una simulación.

Si existe duda entre ejemplo y realidad, conserva el perfil previo confirmado y conversa normalmente.

==================================================
REGLA CRÍTICA: CORRECCIONES
==================================================

El dato explícito MÁS RECIENTE tiene prioridad.

Ejemplo:

Usuario:
"Mi nombre es Carlos."

Después:
"No, perdón, realmente me llamo Andrés. Carlos no."

Resultado:
nombre = Andrés

No conserves Carlos.

Otro ejemplo:

"Estoy en Bogotá."
Después:
"Perdón, la empresa está en Medellín."

Si queda claro que Medellín es la ubicación relevante del negocio, usa Medellín.

==================================================
PERFIL PREVIO NO ES VERDAD ABSOLUTA
==================================================

El navegador puede haber detectado datos automáticamente.

Trata este perfil previo como una HIPÓTESIS.

No mantengas un dato si el historial real contradice ese dato.

No conviertas valores predeterminados de la interfaz en hechos.

Especialmente:

- "clinica" no significa automáticamente odontología;
- un ejemplo de nicho no significa que el usuario tenga ese negocio;
- una palabra aislada no confirma propiedad del negocio.

==================================================
DEMOSTRACIÓN NATURAL
==================================================

Si el visitante todavía está explorando:

- responde principalmente como demostración;
- usa el contexto real que sí conozcas;
- no pidas WhatsApp demasiado pronto;
- puedes hacer una pregunta que simultáneamente mejore la demo y revele contexto.

Ejemplo:

"Perfecto. Para una clínica estética, el agente podría filtrar por tratamiento, intención y disponibilidad antes de pasar el contacto al equipo. ¿Hoy ustedes reciben más consultas por Instagram o por WhatsApp?"

Esa pregunta demuestra el sistema Y descubre el proceso comercial.

==================================================
TRANSICIÓN A INTERÉS COMERCIAL
==================================================

Considera intención comercial cuando el visitante:

- dice que le interesa;
- pregunta cómo implementarlo;
- pregunta precio o cotización;
- quiere empezar;
- quiere contratar;
- pide hablar con Guido;
- pide llamada o reunión;
- deja WhatsApp;
- expresa un problema concreto que quiere resolver.

Cuando exista interés:

1. Sigue aportando valor.
2. No reinicies la conversación.
3. No repitas preguntas respondidas.
4. Completa SOLO los datos importantes que falten.
5. Nombre y WhatsApp se solicitan cuando la conversación ya justifica contacto.
6. Si el usuario ya dejó WhatsApp, no lo vuelvas a pedir.
7. Si ya hay suficiente contexto, orienta naturalmente hacia Guido.

==================================================
QUÉ HACE GUIDO
==================================================

Guido Paraco trabaja como Growth Partner IA.

Puede trabajar con:

- agentes IA;
- automatización;
- CRM;
- WhatsApp;
- Meta Ads;
- embudos;
- adquisición;
- seguimiento comercial;
- conversión;
- retención;
- sistemas conectados de crecimiento.

No inventes resultados ni garantías.

No inventes precios específicos.

Si preguntan precio:

"Depende del negocio, los canales y el nivel de sistema que tenga sentido implementar."

Después continúa la calificación natural.

==================================================
NICHO / TIPO DE NEGOCIO
==================================================

Tipo de negocio debe ser humano y específico.

Ejemplos:

"clínica estética"
"restaurante"
"firma de abogados"
"tienda e-commerce de ropa"
"gimnasio"
"inmobiliaria"

Nicho puede ser una clasificación breve.

Ejemplos:

"estética"
"restaurantes"
"legal"
"ecommerce"
"fitness"
"inmobiliario"

==================================================
NECESIDAD
==================================================

No copies cualquier frase del usuario como necesidad.

Resume el PROBLEMA COMERCIAL real.

Ejemplo:

Usuario:
"Nos escriben como 80 personas al mes por Instagram pero muchas preguntan y después desaparecen."

Necesidad:
"Mejorar conversión y seguimiento de consultas de Instagram para aumentar citas."

==================================================
URGENCIA
==================================================

Alta:
quiere empezar ya, esta semana, cuanto antes, tiene urgencia explícita.

Media:
quiere resolverlo pronto, este mes o próximas semanas.

Baja:
está explorando sin prisa.

Vacío:
no existe evidencia suficiente.

==================================================
RESPUESTA VISIBLE
==================================================

- Español natural.
- Cercano y profesional.
- Máximo 90 palabras.
- Máximo una pregunta.
- No digas que eres "una inteligencia artificial".
- No digas que estás recopilando datos.
- No digas que guardaste algo en CRM.
- No digas que contactaste a Guido.
- No prometas resultados garantizados.
- No inventes información.
- No confundas una clínica estética con odontología.
- No repitas datos innecesariamente.

==================================================
DATOS ACTUALES
==================================================

Pista de nicho de interfaz:
${cleanString(niche, 80) || 'ninguna'}

Contexto de interfaz:
${JSON.stringify(context || {})}

Perfil previo PROVISIONAL:
${JSON.stringify(previousProfile)}

Recuerda:
el historial y las afirmaciones explícitas del usuario tienen prioridad sobre el perfil provisional.
`;

    const messages = [
      {
        role: 'user',
        content: `INSTRUCCIONES OPERATIVAS DEL AGENTE:\n${instructions}`
      },
      ...safeHistory,
      {
        role: 'user',
        content: currentMessage
      }
    ];

    // ==========================================
    // STRUCTURED OUTPUT
    // ==========================================

    const responseFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'guido_web_agent_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            reply: {
              type: 'string'
            },

            conversationMode: {
              type: 'string',
              enum: [
                'DEMO',
                'DISCOVERY',
                'COMMERCIAL'
              ]
            },

            prospect: {
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                },

                whatsapp: {
                  type: 'string'
                },

                city: {
                  type: 'string'
                },

                businessType: {
                  type: 'string'
                },

                niche: {
                  type: 'string'
                },

                need: {
                  type: 'string'
                },

                urgency: {
                  type: 'string',
                  enum: [
                    '',
                    'Baja',
                    'Media',
                    'Alta'
                  ]
                },

                realBusinessConfirmed: {
                  type: 'boolean'
                },

                implementationIntent: {
                  type: 'boolean'
                },

                wantsGuido: {
                  type: 'boolean'
                }
              },

              required: [
                'name',
                'whatsapp',
                'city',
                'businessType',
                'niche',
                'need',
                'urgency',
                'realBusinessConfirmed',
                'implementationIntent',
                'wantsGuido'
              ],

              additionalProperties: false
            },

            summary: {
              type: 'string'
            },

            nextAction: {
              type: 'string'
            }
          },

          required: [
            'reply',
            'conversationMode',
            'prospect',
            'summary',
            'nextAction'
          ],

          additionalProperties: false
        }
      }
    };

    // ==========================================
    // GROQ REQUEST
    // ==========================================

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
          temperature: 0.55,
          max_completion_tokens: 900,
          reasoning_effort: 'low',
          reasoning_format: 'hidden',
          response_format: responseFormat,
          stream: false
        })
      }
    );

    const completion = await groqResponse
      .json()
      .catch(() => ({}));

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
        error: upstreamError
      });
    }

    const rawContent =
      completion?.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.error(
        'GROQ_EMPTY_REPLY',
        JSON.stringify(completion)
      );

      return json(502, {
        reply: null,
        fallback: true,
        model,
        error: 'Groq respondió sin contenido.'
      });
    }

    let structured;

    try {
      structured = JSON.parse(rawContent);
    } catch (error) {
      console.error(
        'GROQ_JSON_PARSE_ERROR',
        rawContent
      );

      return json(502, {
        reply: null,
        fallback: true,
        model,
        error: 'No se pudo interpretar la respuesta estructurada.'
      });
    }

    // ==========================================
    // NORMALIZACIÓN FINAL
    // ==========================================

    const prospect = {
      name: cleanString(
        structured?.prospect?.name,
        100
      ),

      whatsapp: normalizePhone(
        structured?.prospect?.whatsapp
      ),

      city: cleanString(
        structured?.prospect?.city,
        100
      ),

      businessType: cleanString(
        structured?.prospect?.businessType,
        150
      ),

      niche: cleanString(
        structured?.prospect?.niche,
        80
      ),

      need: cleanString(
        structured?.prospect?.need,
        350
      ),

      urgency: [
        'Baja',
        'Media',
        'Alta'
      ].includes(structured?.prospect?.urgency)
        ? structured.prospect.urgency
        : '',

      realBusinessConfirmed:
        Boolean(
          structured?.prospect?.realBusinessConfirmed
        ),

      implementationIntent:
        Boolean(
          structured?.prospect?.implementationIntent
        ),

      wantsGuido:
        Boolean(
          structured?.prospect?.wantsGuido
        )
    };

    // Si el modelo dice que NO existe negocio real confirmado,
    // no permitimos que un simple ejemplo nuevo invente negocio.
    // Pero conservamos un negocio previo ya confirmado si existe.
    if (
      !prospect.realBusinessConfirmed &&
      !previousProfile.businessType
    ) {
      prospect.businessType = '';
      prospect.niche = '';
    }

    const score = calculateScore(prospect);
    const state = calculateState(prospect, score);
    const nextMissingField =
      getNextMissingField(prospect);

    const crmReady = Boolean(
      prospect.whatsapp &&
      prospect.businessType &&
      prospect.need
    );

    const priority =
      score >= 80
        ? 'Muy alta'
        : score >= 65
          ? 'Alta'
          : score >= 40
            ? 'Media'
            : 'Baja';

    const stage =
      state === 'Listo para contacto'
        ? 4
        : state === 'Lead calificado'
          ? 3
          : state === 'Lead en conversación'
            ? 2
            : 1;

    // ==========================================
    // RESPONSE
    // ==========================================

    return json(200, {
      reply: cleanString(
        structured?.reply,
        1200
      ),

      model,

      conversationMode:
        structured?.conversationMode ||
        'DEMO',

      prospect,

      crm: {
        nombre: prospect.name,
        whatsapp: prospect.whatsapp,
        ciudad: prospect.city,
        tipoNegocio: prospect.businessType,
        nicho: prospect.niche,
        necesidad: prospect.need,
        urgencia: prospect.urgency,
        leadScore: score,
        resumenConversacion: cleanString(
          structured?.summary,
          800
        ),
        estado: state,
        proximaAccion: cleanString(
          structured?.nextAction,
          250
        ),
        fuente: 'Web / Simulador IA'
      },

      crmReady,
      nextMissingField,

      score,
      stage,

      stageLabel:
        state === 'Listo para contacto'
          ? 'Lead listo para contacto'
          : state === 'Lead calificado'
            ? 'Lead calificado'
            : structured?.conversationMode === 'COMMERCIAL'
              ? 'Interés comercial detectado'
              : structured?.conversationMode === 'DISCOVERY'
                ? 'Contexto comercial en construcción'
                : 'Demo de agente IA',

      crmState: state,
      priority,

      nextAction:
        cleanString(
          structured?.nextAction,
          250
        ) ||
        (
          nextMissingField
            ? `Completar ${nextMissingField}`
            : 'Continuar conversación'
        )
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
