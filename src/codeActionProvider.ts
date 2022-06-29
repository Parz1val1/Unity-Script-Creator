import {
    commands,
    window,
    workspace,
    CancellationToken,
    CodeAction,
    CodeActionContext,
    CodeActionKind,
    Position,
    Range,
    TextDocument,
    TextEdit,
    Uri,
    WorkspaceEdit,
    CodeActionProvider as VSCodeCodeActionProvider
} from 'vscode';
import * as os from 'os';

export default class CodeActionProvider implements VSCodeCodeActionProvider {
    private _commandIds = {
        ctorFromProperties: 'unityscriptcreator.ctorFromProperties',
        initializeMemberFromCtor: 'unityscriptcreator.initializeMemberFromCtor',
    };

    private static readonly ReadonlyRegex = new RegExp(/(public|private|protected)\s(\w+)\s(\w+)\s?{\s?(get;)\s?(private\s)?(set;)?\s?}/g);
    private static readonly ClassRegex = new RegExp(/(private|internal|public|protected)\s?(static)?\sclass\s(\w*)/g);
    private static readonly GeneralRegex = new RegExp(/(public|private|protected)\s(.*?)\(([\s\S]*?)\)/gi);

    constructor() {
        commands.registerCommand(this._commandIds.initializeMemberFromCtor, this.initializeMemberFromCtor, this);
        commands.registerCommand(this._commandIds.ctorFromProperties, this.executeCtorFromProperties, this);
    }

    public provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): CodeAction[] {//Command[] {
        const codeActions = new Array<CodeAction>();

        const addInitalizeFromCtor = (type: MemberGenerationType) => {
            const action = this.getInitializeFromCtorAction(document, range, context, token, type);

            if (action) codeActions.push(action);
        };

        addInitalizeFromCtor(MemberGenerationType.PrivateField);
        addInitalizeFromCtor(MemberGenerationType.ReadonlyProperty);
        addInitalizeFromCtor(MemberGenerationType.Property);

        const ctorPAction = this.getCtorpAction(document);

        if (ctorPAction) codeActions.push(ctorPAction);

        return codeActions;
    }

    private camelize(str: string) {
        return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
            if (+match === 0) return ''; // or if (/\s+/.test(match)) for white spaces

            return index === 0 ? match.toLowerCase() : match.toUpperCase();
        });
    }

    private async executeCtorFromProperties(args: ConstructorFromPropertiesArgument) {
        const tabSize = workspace.getConfiguration().get('editor.tabSize', 4);
        const ctorParams = new Array<string>();

        if (!args.properties)
            return;

        args.properties.forEach((p) => {
            ctorParams.push(`${p.type} ${this.camelize(p.name)}`);
        });

        const assignments = args.properties
            .map(prop => `${Array(tabSize * 1).join(' ')} this.${prop.name} = ${this.camelize(prop.name)};${os.EOL}`);

        const firstPropertyLine = args.properties.sort((a, b) => a.lineNumber - b.lineNumber)[0].lineNumber;

        const ctorStatement = `${Array(tabSize * 2).join(' ')} ${args.classDefinition.modifier} ${args.classDefinition.className}(${ctorParams.join(', ')}) 
        {
        ${assignments.join('')}   
        }
        `;

        const edit = new WorkspaceEdit();
        const edits = new Array<TextEdit>();

        const pos = new Position(firstPropertyLine, 0);
        const range = new Range(pos, pos);
        const ctorEdit = new TextEdit(range, ctorStatement);

        edits.push(ctorEdit);

        await this.formatDocument(args.document.uri, edit, edits);
    }

    private async formatDocument(documentUri: Uri, edit: WorkspaceEdit, edits: Array<TextEdit>) {
        edit.set(documentUri, edits);

        const reFormatAfterChange = workspace.getConfiguration().get('unityscriptcreator.reFormatAfterChange', true);

        await workspace.applyEdit(edit);

        if (reFormatAfterChange) {
            try {
                const formattingEdits = await commands.executeCommand<TextEdit[]>('executeFormatDocumentProvider', documentUri);

                if (formattingEdits !== undefined) {
                    const formatEdit = new WorkspaceEdit();

                    formatEdit.set(documentUri, formattingEdits);

                    workspace.applyEdit(formatEdit);
                }
            } catch (err) {
                console.error('Error trying to format document - ', err);
            }
        }
    }

    private getCtorpAction(document: TextDocument): CodeAction | undefined {
        const editor = window.activeTextEditor;

        if (!editor) return;

        const position = editor.selection.active;
        const withinClass = this.findClassFromLine(document, position.line);

        if (!withinClass) return;

        const properties = new Array<CSharpPropertyDefinition>();
        let lineNo = 0;

        while (lineNo < document.lineCount) {
            const textLine = document.lineAt(lineNo);
            const match = CodeActionProvider.ReadonlyRegex.exec(textLine.text);

            if (match) {
                const foundClass = this.findClassFromLine(document, lineNo);

                if (foundClass && foundClass.className === withinClass.className) {
                    const prop: CSharpPropertyDefinition = {
                        lineNumber: lineNo,
                        class: foundClass,
                        modifier: match[1],
                        type: match[2],
                        name: match[3],
                        statement: match[0]
                    };

                    properties.push(prop);
                }
            }

            lineNo++;
        }

        if (!properties.length) return;

        const classDefinition = this.findClassFromLine(document, position.line);

        if (!classDefinition) return;

        const parameter: ConstructorFromPropertiesArgument = {
            properties: properties,
            classDefinition: classDefinition,
            document: document
        };

        const codeAction = new CodeAction('Initialize ctor from properties...', CodeActionKind.RefactorExtract);

        codeAction.command = {
            title: codeAction.title,
            command: this._commandIds.ctorFromProperties,
            arguments: [parameter]
        };

        return codeAction;
    }

    private findClassFromLine(document: TextDocument, lineNo: number): CSharpClassDefinition | null {
        if (!lineNo) lineNo = document.lineCount - 1;
        if (lineNo >= document.lineCount) lineNo = document.lineCount - 1;

        while (lineNo >= 0) {
            const line = document.lineAt(lineNo);
            const match = CodeActionProvider.ClassRegex.exec(line.text);

            if (match) {
                return {
                    startLine: lineNo,
                    endLine: -1,
                    className: match[3],
                    modifier: match[1],
                    statement: match[0]
                };
            }

            lineNo--;
        }

        return null;
    }

    private async initializeMemberFromCtor(args: InitializeFieldFromConstructor) {
        const edit = new WorkspaceEdit();

        const bodyStartRange = new Range(args.constructorBodyStart, args.constructorBodyStart);
        const declarationRange = new Range(args.constructorStart, args.constructorStart);

        const declarationEdit = new TextEdit(declarationRange, args.memberGeneration.declaration);
        const memberInitEdit = new TextEdit(bodyStartRange, args.memberGeneration.assignment);

        const edits = new Array<TextEdit>();

        if (args.document.getText().indexOf(args.memberGeneration.declaration.trim()) === -1)
            edits.push(declarationEdit);

        if (args.document.getText().indexOf(args.memberGeneration.assignment.trim()) === -1)
            edits.push(memberInitEdit);

        await this.formatDocument(args.document.uri, edit, edits);
    }

    private getInitializeFromCtorAction(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken, memberGenerationType: MemberGenerationType): CodeAction | undefined {
        const editor = window.activeTextEditor;

        if (!editor) return;

        const position = editor.selection.active;
        const positionStart = new Position(position.line < 2 ? 0 : position.line - 2, 0); // Limit line to start of file
        const positionEnd = new Position(document.lineCount - position.line < 2 ? 0 : position.line + 2, 0); // Limit line to end of file
        const surrounding = document.getText(new Range(positionStart, positionEnd));
        const wordRange = editor.document.getWordRangeAtPosition(position);

        if (!wordRange) return;

        const matches = CodeActionProvider.GeneralRegex.exec(surrounding);

        if (!matches) return;

        const ctorParamStr = matches[3];
        const lineText = editor.document.getText(new Range(position.line, 0, position.line, wordRange.end.character));
        const selectedName = lineText.substr(wordRange.start.character, wordRange.end.character - wordRange.start.character);
        let parameterType: string | null = null;

        ctorParamStr.split(',').forEach(strPart => {
            const separated = strPart?.trim().split(' ');

            if (separated?.length > 1 && separated[1].trim() === selectedName)
                parameterType = separated[0].trim();
        });

        if (!parameterType) return;

        const tabSize = workspace.getConfiguration().get('editor.tabSize', 4);
        const privateMemberPrefix = workspace.getConfiguration().get('unityscriptcreator.privateMemberPrefix', '');
        const prefixWithThis = workspace.getConfiguration().get('unityscriptcreator.useThisForCtorAssignments', true);

        let memberGeneration: MemberGenerationProperties;
        let title: string;
        let name: string;

        switch (memberGenerationType) {
            case MemberGenerationType.PrivateField:
                title = 'Initialize field from parameter...';

                memberGeneration = {
                    type: memberGenerationType,
                    declaration: `${Array(tabSize * 2).join(' ')} private readonly ${parameterType} ${privateMemberPrefix}${selectedName};\r\n`,
                    assignment: `${Array(tabSize * 3).join(' ')} ${(prefixWithThis ? 'this.' : '')}${privateMemberPrefix}${selectedName} = ${selectedName};\r\n`
                };
                break;
            case MemberGenerationType.ReadonlyProperty:
                title = 'Initialize readonly property from parameter...';

                name = selectedName[0].toUpperCase() + selectedName.substr(1);

                memberGeneration = {
                    type: memberGenerationType,
                    declaration: `${Array(tabSize * 2).join(' ')} public ${parameterType} ${name} { get; }\r\n`,
                    assignment: `${Array(tabSize * 3).join(' ')} ${(prefixWithThis ? 'this.' : '')}${name} = ${selectedName};\r\n`
                };
                break;
            case MemberGenerationType.Property:
                title = 'Initialize property from parameter...';

                name = selectedName[0].toUpperCase() + selectedName.substr(1);

                memberGeneration = {
                    type: memberGenerationType,
                    declaration: `${Array(tabSize * 2).join(' ')} public ${parameterType} ${name} { get; set; }\r\n`,
                    assignment: `${Array(tabSize * 3).join(' ')} ${(prefixWithThis ? 'this.' : '')}${name} = ${selectedName};\r\n`
                };
                break;
            default:
                //TODO: Show error?
                return;
        }

        const constructorBodyStart = this.findConstructorBodyStart(document, position);

        if (!constructorBodyStart) return;

        const parameter: InitializeFieldFromConstructor = {
            document: document,
            type: parameterType,
            name: selectedName,
            memberGeneration: memberGeneration,
            constructorBodyStart: constructorBodyStart,
            constructorStart: this.findConstructorStart(document, position)
        };

        const codeAction = new CodeAction(title, CodeActionKind.RefactorExtract);

        codeAction.command = {
            title: title,
            command: this._commandIds.initializeMemberFromCtor,
            arguments: [parameter]
        };

        return codeAction;
    }

    private findConstructorBodyStart(document: TextDocument, position: Position): Position | null {
        for (let lineNo = position.line; lineNo < position.line + 5; lineNo++) {
            const line = document.lineAt(lineNo);

            if (line.text.indexOf('{') !== -1)
                return new Position(lineNo + 1, 0);
        }

        return null;
    }

    private findConstructorStart(document: TextDocument, position: Position): Position {
        const foundClass = this.findClassFromLine(document, position.line);

        if (foundClass) {
            for (let lineNo = position.line; lineNo > position.line - 5; lineNo--) {
                const line = document.lineAt(lineNo);

                if (line.isEmptyOrWhitespace && !(line.lineNumber < foundClass.startLine))
                    return new Position(lineNo, 0);
            }
        }

        return new Position(position.line, 0);
    }
}

enum MemberGenerationType {
    Property,
    ReadonlyProperty,
    PrivateField
}

interface MemberGenerationProperties {
    type: MemberGenerationType,
    assignment: string,
    declaration: string
}

interface CSharpClassDefinition {
    startLine: number,
    endLine: number,
    className: string,
    modifier: string,
    statement: string
}

interface CSharpPropertyDefinition {
    class: CSharpClassDefinition,
    modifier: string,
    type: string,
    name: string,
    statement: string,
    lineNumber: number
}

interface ConstructorFromPropertiesArgument {
    document: TextDocument,
    classDefinition: CSharpClassDefinition,
    properties: CSharpPropertyDefinition[]
}

interface InitializeFieldFromConstructor {
    document: TextDocument,
    type: string,
    name: string,
    memberGeneration: MemberGenerationProperties,
    constructorBodyStart: Position,
    constructorStart: Position,
}