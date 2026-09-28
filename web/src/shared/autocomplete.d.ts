declare module "@tarekraafat/autocomplete.js" {
  interface AutoCompleteOptions {
    selector: () => HTMLInputElement;
    name?: string;
    threshold?: number;
    debounce?: number;
    data: {
      src: (query: string) => unknown[] | Promise<unknown[]>;
      keys?: string[];
      cache?: boolean;
    };
    searchEngine?: string;
    resultsList?: {
      id?: string;
      class?: string;
      maxResults?: number;
      tabSelect?: boolean;
      noResults?: boolean;
    };
    resultItem?: {
      class?: string;
      element?: (item: HTMLLIElement, data: { value: unknown }) => void;
    };
  }

  export default class AutoComplete {
    constructor(options: AutoCompleteOptions);
    start(query?: string): void;
    unInit(): void;
  }
}
