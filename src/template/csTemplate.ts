import Template from './template';

export default class CsTemplate extends Template {
    constructor(name: string, command: string, requiredUsings: string[] = []) {
        super(name, command, requiredUsings);
    }

    protected getExtensions(): string[] {
        return ['.cs'];
    }

    protected getOptionalUsings(): string[] {
        return [
            'System',
            'System.Collections',
            'System.Linq',
            'UnityEngine',
        ];
    }

    public async create(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const templatePath = this._getTemplatePath(templatesPath, this._getFileName());
        const filePath = `${pathWithoutExtension}.cs`;

        await this._createFile(templatePath, filePath, filename);
    }
}
