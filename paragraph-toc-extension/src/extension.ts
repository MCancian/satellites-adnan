import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface ParagraphInfo {
    sentence: string;
    lineNumber: number;
}

interface SectionInfo {
    title: string;
    level: number;
    lineNumber: number;
    sentences: ParagraphInfo[];
    wordCount: number;
    tableCount: number;
    figureCount: number;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Paragraph TOC Generator is now active!');

    // Register command for manual generation
    let generateCommand = vscode.commands.registerCommand('paragraphToc.generate', () => {
        generateTOCManual();
    });

    context.subscriptions.push(generateCommand);
}

function generateTOCManual() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('This command only works with Markdown files');
        return;
    }

    generateTOCCore(editor, document);
}

function generateTOCAuto() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        // Silently return for auto-save if no active editor
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'markdown') {
        // Silently return for auto-save if not markdown
        return;
    }

    generateTOCCore(editor, document);
}

function generateTOCCore(editor: vscode.TextEditor, document: vscode.TextDocument) {
    const text = document.getText();
    const abbreviations = loadAbbreviations(document.uri);
    const sections = extractSentences(text, abbreviations);
    
    if (sections.length === 0) {
        vscode.window.showInformationMessage('No sections found to generate TOC');
        return;
    }

    const tocContent = generateTOCContent(sections, document);
    saveTOCFile(document.uri, tocContent);
}

function loadAbbreviations(sourceUri: vscode.Uri): string[] {
    const baseAbbreviations = [
        'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sr', 'Jr',
        'U.S', 'U.K', 'E.U', 'U.N', 'N.Y', 'L.A',
        'etc', 'vs', 'i.e', 'e.g', 'cf', 'et al',
        'Inc', 'Corp', 'Ltd', 'Co', 'LLC',
        'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
        'St', 'Ave', 'Rd', 'Blvd', 'Dept', 'Univ', 'govt', 'admin'
    ];

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
    if (!workspaceFolder) {
        return baseAbbreviations;
    }

    const abbreviationsPath = path.join(workspaceFolder.uri.fsPath, 'toc-abbreviations.json');
    try {
        if (fs.existsSync(abbreviationsPath)) {
            const customAbbreviations = JSON.parse(fs.readFileSync(abbreviationsPath, 'utf8'));
            if (Array.isArray(customAbbreviations)) {
                return [...baseAbbreviations, ...customAbbreviations];
            }
        }
    } catch (error) {
        console.error(`Error loading custom abbreviations: ${error}`);
    }

    return baseAbbreviations;
}

function extractSentences(text: string, abbreviations: string[]): SectionInfo[] {
    const lines = text.split('\n');
    const sections: SectionInfo[] = [];
    let currentSection: SectionInfo | null = null;
    let currentLineIndex = 0;
    
    // Split by double newlines to get paragraphs, but track line numbers
    const paragraphs = text.split(/\n\s*\n/);
    
    for (const paragraph of paragraphs) {
        const paragraphStartLine = findParagraphStartLine(lines, paragraph, currentLineIndex);
        const trimmedParagraph = paragraph.trim();
        
        // Check if this paragraph is a header
        const headerMatch = trimmedParagraph.match(/^(#+)\s+(.+)$/m);
        
        if (headerMatch) {
            // This is a header - create a new section
            const level = headerMatch[1].length;
            const title = headerMatch[2].trim();
            
            currentSection = {
                title: title,
                level: level,
                lineNumber: paragraphStartLine + 1,
                sentences: [],
                wordCount: 0,
                tableCount: 0,
                figureCount: 0
            };
            sections.push(currentSection);
        } else {
            // This is regular content
            const cleanParagraph = paragraph
                .replace(/^\s*[-*+]\s+/, '') // Remove list markers
                .replace(/^\s*\d+\.\s+/, '') // Remove numbered list markers
                .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
                .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
                .replace(/`(.*?)`/g, '$1') // Remove inline code
                .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links, keep text
                .trim();
            
            if (cleanParagraph.length === 0) {
                currentLineIndex = paragraphStartLine + paragraph.split('\n').length;
                continue;
            }
            
            // If no current section, create a default one
            if (!currentSection) {
                currentSection = {
                    title: "Introduction",
                    level: 1,
                    lineNumber: 1,
                    sentences: [],
                    wordCount: 0,
                    tableCount: 0,
                    figureCount: 0
                };
                sections.push(currentSection);
            }
            
            // Count words, tables, and figures in this paragraph
            const words = cleanParagraph.split(/\s+/).filter(word => word.length > 0);
            currentSection.wordCount += words.length;
            
            // Count tables (look for | characters suggesting table syntax)
            const tableMatches = paragraph.match(/\|.*\|/g);
            if (tableMatches) {
                currentSection.tableCount += Math.ceil(tableMatches.length / 2); // Rough estimate
            }
            
            // Count figures (look for image syntax or figure references)
            const figureMatches = paragraph.match(/!\[.*?\]\(.*?\)|figure\s+\d+|fig\.\s*\d+/gi);
            if (figureMatches) {
                currentSection.figureCount += figureMatches.length;
            }
            
            // If this is the abstract/introduction, get all sentences
            if (currentSection.title === "Introduction" || currentSection.title === "Abstract") {
                const allSentences = extractAllSentences(cleanParagraph, abbreviations);
                for (const sentence of allSentences) {
                    currentSection.sentences.push({
                        sentence: sentence,
                        lineNumber: paragraphStartLine + 1 // Line number points to start of paragraph
                    });
                }
            } else {
                // For other sections, just get the first sentence
                const firstSentence = extractFirstSentence(cleanParagraph, abbreviations);
                if (firstSentence.length > 0) {
                    currentSection.sentences.push({
                        sentence: firstSentence,
                        lineNumber: paragraphStartLine + 1
                    });
                }
            }
        }
        
        currentLineIndex = paragraphStartLine + paragraph.split('\n').length;
    }
    
    return sections;
}

function extractAllSentences(text: string, abbreviations: string[]): string[] {
    const sentences: string[] = [];
    let remainingText = text;

    while (remainingText.length > 0) {
        const sentence = extractFirstSentence(remainingText, abbreviations);
        if (sentence.length > 0) {
            sentences.push(sentence);
            const nextStartIndex = remainingText.indexOf(sentence) + sentence.length;
            remainingText = remainingText.slice(nextStartIndex).trim();
        } else {
            break; // No more sentences found
        }
    }
    return sentences;
}

function extractFirstSentence(text: string, abbreviations: string[]): string {
    // Common abbreviations that shouldn't end a sentence
    
    let pos = 0;
    
    while (pos < text.length) {
        // Find the next sentence-ending punctuation
        const match = text.slice(pos).match(/[.!?]/);
        if (!match) {
            // No sentence ending found, return everything or truncate if too long
            return text.length > 150 ? text.substring(0, 150) + '...' : text;
        }
        
        const punctPos = pos + match.index!;
        const endPos = punctPos + 1;
        
        // Look at the word before the punctuation
        const textBeforePunct = text.slice(0, punctPos);
        const wordMatch = textBeforePunct.match(/\b(\w+(?:\.\w+)*)$/);
        
        if (wordMatch) {
            const word = wordMatch[1];
            
            // Check if this word is a known abbreviation
            const isKnownAbbrev = abbreviations.some(abbr => {
                const abbrevLower = abbr.toLowerCase();
                const wordLower = word.toLowerCase();
                return wordLower === abbrevLower || 
                       wordLower === abbrevLower + '.' ||
                       wordLower.replace(/\./g, '') === abbrevLower.replace(/\./g, '');
            });
            
            // Check for patterns like "U.S." or "A.B.C."
            const isLetterDotPattern = /^[A-Z](\.[A-Z])*\.?$/.test(word);
            
            if (isKnownAbbrev || isLetterDotPattern) {
                // This looks like an abbreviation, continue looking
                pos = endPos;
                continue;
            }
        }
        
        // Check what comes after the punctuation
        if (endPos < text.length) {
            const nextChar = text[endPos];
            
            // If next character is whitespace followed by capital letter or end of text
            if (nextChar === ' ' || nextChar === '\n' || nextChar === '\t') {
                const remainingText = text.slice(endPos).trim();
                if (remainingText.length === 0 || /^[A-Z]/.test(remainingText)) {
                    // This looks like a real sentence ending
                    return text.slice(0, endPos).trim();
                }
            } else if (nextChar === '"' || nextChar === "'" || nextChar === ')') {
                // Handle punctuation followed by quotes or parentheses
                let checkPos = endPos + 1;
                while (checkPos < text.length && /["')\s]/.test(text[checkPos])) {
                    checkPos++;
                }
                
                if (checkPos >= text.length || /[A-Z]/.test(text[checkPos])) {
                    return text.slice(0, endPos).trim();
                }
            }
        } else {
            // End of text
            return text.slice(0, endPos).trim();
        }
        
        pos = endPos;
    }
    
    // If we get here, return the whole text (truncated if too long)
    return text.length > 150 ? text.substring(0, 150) + '...' : text;
}

function findParagraphStartLine(lines: string[], paragraph: string, startIndex: number): number {
    const paragraphLines = paragraph.split('\n');
    const firstLine = paragraphLines[0].trim();
    
    for (let i = startIndex; i < lines.length; i++) {
        if (lines[i].trim() === firstLine) {
            return i;
        }
    }
    
    return startIndex; // fallback
}

function generateTOCContent(sections: SectionInfo[], document: vscode.TextDocument): string {
    const timestamp = new Date().toLocaleString();
    const sourceName = path.basename(document.fileName);
    const sourceUri = document.uri.toString();
    
    let tocContent = `# Table of Contents\n\n`;
    
    // Create hidden links that won't show in preview but work in editing mode
    tocContent += `<!-- Source: ${sourceUri} -->\n`;
    tocContent += `<!-- Generated: ${timestamp} -->\n\n`;
    
    for (const section of sections) {
        // Create section header with appropriate level
        const headerPrefix = '#'.repeat(section.level + 1); // +1 since we used # for main title
        
        // Create invisible link for navigation
        const invisibleLink = `<!-- [${section.title}](${sourceUri}#${section.lineNumber}) -->`;
        tocContent += `${invisibleLink}\n`;
        tocContent += `${headerPrefix} ${section.title}\n\n`;
        
        // Add metadata
        let metadata = `*${section.wordCount} words`;
        if (section.tableCount > 0) {
            metadata += `, ${section.tableCount} table${section.tableCount > 1 ? 's' : ''}`;
        }
        if (section.figureCount > 0) {
            metadata += `, ${section.figureCount} figure${section.figureCount > 1 ? 's' : ''}`;
        }
        metadata += `*\n\n`;
        tocContent += metadata;
        
        // Add sentences as bullet points
        if (section.sentences.length > 0) {
            // Check if this is the abstract section
            if (section.title === "Introduction" && section.level === 1) {
                let sentenceNumber = 1;
                for (const sentenceInfo of section.sentences) {
                    const hiddenSentenceLink = `<!-- [Line ${sentenceInfo.lineNumber}](${sourceUri}#${sentenceInfo.lineNumber}) -->`;
                    tocContent += `${hiddenSentenceLink}\n`;
                    tocContent += `${sentenceNumber}. ${sentenceInfo.sentence}\n\n`;
                    sentenceNumber++;
                }
            } else {
                for (const sentenceInfo of section.sentences) {
                    // Hidden link for navigation
                    const hiddenSentenceLink = `<!-- [Line ${sentenceInfo.lineNumber}](${sourceUri}#${sentenceInfo.lineNumber}) -->`;
                    tocContent += `${hiddenSentenceLink}\n`;
                    tocContent += `- ${sentenceInfo.sentence}\n\n`;
                }
            }
        }
        
        tocContent += `---\n\n`;
    }
    
    return tocContent;
}

function saveTOCFile(sourceUri: vscode.Uri, tocContent: string) {
    const sourceDir = path.dirname(sourceUri.fsPath);
    const sourceFileName = path.basename(sourceUri.fsPath); // Keep full filename with .md
    const tocFileName = `TOC_${sourceFileName}`;
    const tocPath = path.join(sourceDir, tocFileName);
    
    try {
        fs.writeFileSync(tocPath, tocContent, 'utf8');
        
        vscode.window.showInformationMessage(
            `TOC generated: ${tocFileName}`, 
            'Open TOC'
        ).then(selection => {
            if (selection === 'Open TOC') {
                vscode.workspace.openTextDocument(tocPath).then(doc => {
                    vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                });
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Error saving TOC file: ${error}`);
    }
}

export function deactivate() {}