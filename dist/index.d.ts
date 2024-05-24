import { Plugin } from 'vite';

/**
 * Inject css at the top of each generated chunk file, only works with library mode.
 * @param base DOC 타입시 base 경로를 지정할 수 있습니다. default: '/'
 * @param injectionType 'IMPORT' | 'DOC'. default: 'IMPORT'
 */
declare function libInjectCss({ base, injectionType, }?: {
    base?: string;
    injectionType?: 'IMPORT' | 'DOC';
}): Plugin;

export { libInjectCss };
