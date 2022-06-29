import CsprojReader from './project/csprojReader';
import { workspace } from 'vscode';

export class FileScopedNamespaceConverter {
    private static readonly NamespaceRegex = new RegExp(/(?<=\${namespace})/);
    private static readonly NamespaceBracesRegex = new RegExp(/(?<=^)({|}| {4})/, 'gm');

    /**
     * If the file to be created is a C# file, 
     * and the TargetFramework version of the current project is .NET 6.0+, 
     * and this feature is enabled in settings, 
     * then return the file-scoped namespace form of the template. 
     * 
     * Else return the original template.
     * 
     * @param template The content of the C# template file.
     * @param filePath The path of the C# file that is being created. Used to locate the .csproj file and get the TargetFramework version.
     */
    public async getFileScopedNamespaceFormOfTemplateIfNecessary(template: string, filePath: string): Promise<string> {
        if (await this.shouldUseFileScopedNamespace(filePath)) {
            return this.getFileScopedNamespaceFormOfTemplate(template);
        }

        return template;
    }

    /**
     * If the 'file scoped namespace' feature of .net6+ should be used
     *
     * @param filePath The path of the file to check for
     * @returns If the 'file scoped namespace' feature should be used
     */
    private async shouldUseFileScopedNamespace(filePath: string): Promise<boolean> {
        if (!filePath.endsWith('.cs')) return false;
        if (!workspace.getConfiguration().get<boolean>('unityscriptcreator.useFileScopedNamespace', false)) return false;

        return await this.isTargetFrameworkHigherThanOrEqualToDotNet6(filePath);
    }

    /**
     * If the target framework of the project containing the file from the given filePath is higher than, or equal to, .net6
     *
     * @param filePath The file to check for
     * @returns If the target framework is higher than or equal to .net6
     */
    private async isTargetFrameworkHigherThanOrEqualToDotNet6(filePath: string): Promise<boolean> {
        const csprojReader = await CsprojReader.createFromPath(filePath);

        return !!csprojReader && await csprojReader.isTargetFrameworkHigherThanOrEqualToDotNet6() === true;
    }

    /**
     * Get the file-scoped namespace form of the template.
     * 
     * From:
     * ```csharp
     * namespace ${namespace}
     * {
     *    // Template content
     *    // Template content
     * }
     * ```
     * 
     * To:
     * ```csharp
     * namespace ${namespace};
     * 
     * // Template content
     * // Template content
     * ```
     * 
     * @param template The content of the C# template file.
     */
    private getFileScopedNamespaceFormOfTemplate(template: string): string {
        const result = template
            .replace(FileScopedNamespaceConverter.NamespaceBracesRegex, '')
            .replace(FileScopedNamespaceConverter.NamespaceRegex, ';');

        return result;
    }
}

export default new FileScopedNamespaceConverter();