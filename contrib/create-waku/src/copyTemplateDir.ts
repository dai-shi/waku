import fs from 'node:fs'
import path from 'node:path'
import { renderTemplate } from './renderTemplate.js'

export function copyTemplate() {
  const cwd = process.cwd()
  let root = path.join(cwd, '/template')
  
  if(!fs.existsSync(root)) {
    fs.mkdirSync(root)
  }
  
  const CHOICES = fs.readdirSync(path.resolve(cwd, '../../examples'))
  const templateRoot = path.resolve(cwd, '../../examples')
  
  for(let i = 0; i < CHOICES.length; i++) {
    const templateDir = path.resolve(templateRoot, CHOICES[i] as string)
    root = path.join(cwd, '/template', CHOICES[i] as string)
    renderTemplate(templateDir, root)
  }
}

copyTemplate()
