/* GitHub Pages -> Apps Script。收到明確的儲存確認才顯示成功。 */
(() => {
  'use strict';
  let busy = false;
  let previous = null;
  const expectedType = 'hualien-survey-result';
  const googleOrigin = /^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+-)?script\.googleusercontent\.com)$/;

  function status(message, ok = false) {
    const el = document.getElementById('success');
    el.textContent = message;
    el.style.display = 'block';
    el.style.background = ok ? '#eff7f2' : '#fff6e6';
    el.style.borderColor = ok ? '#cfe4d5' : '#dcc39a';
    el.style.color = '#243c43';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function collect(form) {
    const answers = {};
    const data = new FormData(form);
    for (const [key, value] of data) {
      if (key === 'attend' || key === 'hotel') {
        (answers[key] ||= []).push(value);
      } else answers[key] = String(value).trim();
    }
    return answers;
  }

  function post(endpoint, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.name = 'survey_' + payload.requestId;
      iframe.hidden = true;
      iframe.title = '問卷送出結果';
      const transport = document.createElement('form');
      transport.method = 'POST';
      transport.action = endpoint;
      transport.target = iframe.name;
      transport.hidden = true;
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'payload';
      field.value = JSON.stringify(payload);
      transport.append(field);
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        transport.remove();
        iframe.remove();
      };
      function onMessage(event) {
        if (!googleOrigin.test(event.origin)) return;
        const result = event.data;
        if (!result || result.type !== expectedType || result.requestId !== payload.requestId) return;
        cleanup();
        if (result.ok === true) resolve(result);
        else reject(new Error(result.message || '目前無法確認送出，請稍後重試。'));
      }
      window.addEventListener('message', onMessage);
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('尚未收到儲存確認。請保留目前填寫資料並重試；相同送出不會重複計算。'));
      }, timeoutMs);
      document.body.append(iframe, transport);
      transport.submit();
    });
  }

  async function submit(form) {
    if (busy) return;
    const config = window.SURVEY_CONFIG || {};
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint || '')) {
      status('問卷收件尚未啟用，請稍後再試或聯絡主辦單位。');
      return;
    }
    if (location.origin === 'null') {
      status('請從正式問卷網址開啟此頁，再送出資料。');
      return;
    }
    const answers = collect(form);
    const content = JSON.stringify(answers);
    // 同一頁面逾時重試沿用 requestId；修改答案後使用新編號。
    if (!previous || previous.content !== content) {
      previous = { content, requestId: crypto.randomUUID() };
    }
    const payload = { requestId: previous.requestId, origin: location.origin, answers };
    const button = form.querySelector('button[type="submit"]');
    busy = true;
    button.disabled = true;
    button.textContent = '資料送出中…';
    status('正在儲存您的回覆，請稍候。');
    try {
      await post(config.endpoint, payload, config.timeoutMs || 60000);
      status('已收到您的回覆，謝謝！如需修改，請使用相同姓名與電話重新送出；統計會採用最新回覆。', true);
    } catch (error) {
      status(error.message || '送出未完成，請稍後重試。');
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = '送出問卷';
    }
  }
  window.SurveyClient = Object.freeze({ submit });
})();
