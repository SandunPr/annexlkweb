/** Enhance native selects with a searchable, keyboard-friendly listbox. */
export function initSearchableSelects(selector = 'select[data-searchable]') {
  document.querySelectorAll(selector).forEach((select) => {
    if (select.dataset.searchableReady === 'true') return;
    select.dataset.searchableReady = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'searchable-select';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'form-control searchable-select-input';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');

    const list = document.createElement('div');
    list.className = 'searchable-select-list hidden';
    list.setAttribute('role', 'listbox');
    const options = Array.from(select.options);
    const emptyOption = options.find((option) => option.value === '');

    // An empty option describes the unfiltered state; show it as a hint instead
    // of making its label part of the user's search query.
    input.placeholder = emptyOption?.textContent.trim() || 'Type to search';

    const syncInput = () => {
      const selected = select.options[select.selectedIndex];
      input.value = selected && selected.value ? selected.textContent.trim() : '';
    };

    const close = () => {
      list.classList.add('hidden');
      input.setAttribute('aria-expanded', 'false');
    };

    const render = (query = '') => {
      const term = query.trim().toLowerCase();
      const matches = options.filter((option) => option.textContent.toLowerCase().includes(term));
      list.innerHTML = '';

      if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'searchable-select-empty';
        empty.textContent = 'No matching options';
        list.appendChild(empty);
      } else {
        matches.forEach((option) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'searchable-select-option';
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', String(option.value === select.value));
          item.textContent = option.textContent.trim();
          item.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncInput();
            close();
          });
          list.appendChild(item);
        });
      }

      list.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
    };

    input.addEventListener('focus', () => {
      render('');
      // A city that is already selected should be replaced by the next typed
      // query, rather than having the query appended to its label.
      input.select();
    });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        syncInput();
        close();
        input.blur();
      } else if (event.key === 'Enter') {
        const first = list.querySelector('.searchable-select-option');
        if (first) {
          event.preventDefault();
          first.click();
        }
      }
    });
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        syncInput();
        close();
      }, 100);
    });
    select.addEventListener('change', syncInput);
    select.form?.addEventListener('reset', () => window.setTimeout(syncInput));

    select.classList.add('searchable-select-native');
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(input, list, select);
    syncInput();
  });
}

export default initSearchableSelects;
