export interface Option {
  value: string
  text?: string
  optCss?: string
}

export function NewOption(doc: Document, item: Option): HTMLOptionElement {
  const option = doc.createElement('option')
  option.value = item.value.toLowerCase()
  if (item.text) {
    option.textContent = item.text
  } else {
    option.textContent = item.value
  }

  if (item.optCss) {
    option.style.cssText = item.optCss
  }
  return option
}

export function NewSelect(doc: Document, items: Option[]): HTMLSelectElement {
  const eleSelect = doc.createElement('select')
  items.map((item) => {
    const option = NewOption(doc, item)
    eleSelect.appendChild(option)
  })

  return eleSelect
}

export interface Button {
  id: string
  text: string
  btnClass?: string | null
  btnCss?: string
}

export function NewButton(doc: Document, item: Button): HTMLButtonElement {
  const buttonEle = doc.createElement('button')
  buttonEle.id = item.id
  buttonEle.textContent = item.text
  if (item.btnCss) {
    buttonEle.style.cssText = item.btnCss
  }
  if (item.btnClass) {
    buttonEle.className = item.btnClass
  }
  return buttonEle
}

export function NewButtonList(doc: Document, items: Button[]): HTMLElement {
  const eleDiv = doc.createElement('div')
  items.map((item) => {
    const button = NewButton(doc, item)
    eleDiv.appendChild(button)
  })
  return eleDiv
}

export interface Label {
  forHtml: string
  text: string
  divId?: string
  divClass?: string
  divCss?: string
}

export function NewLabel(doc: Document, item: Label): HTMLLabelElement {
  const labelEle = doc.createElement('label')
  labelEle.htmlFor = item.forHtml
  labelEle.textContent = item.text
  return labelEle
}

export function NewLabelDiv(doc: Document, item: Label): HTMLElement {
  const labelDiv = doc.createElement('div')
  if (item.divId) {
    labelDiv.id = item.divId
  }
  if (item.divClass) {
    labelDiv.className = item.divClass
  }
  if (item.divCss) {
    labelDiv.style.cssText = item.divCss
  }
  labelDiv.appendChild(NewLabel(doc, item))
  return labelDiv
}

export function NewLabelList(doc: Document, items: Label[]): HTMLElement {
  const eleDiv = doc.createElement('div')
  items.map((item) => {
    const labelDiv = NewLabelDiv(doc, item)
    eleDiv.appendChild(labelDiv)
  })
  return eleDiv
}

export interface CheckBox {
  id: string
  value: string
  name?: string
}

export function NewCheckBox(doc: Document, divClass: string, item: CheckBox): HTMLElement {
  const boxDiv = doc.createElement('div')
  boxDiv.className = divClass
  const boxEle = doc.createElement('input')
  boxEle.type = 'checkbox'
  boxEle.id = item.id
  if (item.name) {
    boxEle.name = item.name
  }
  boxEle.value = item.value
  boxDiv.appendChild(boxEle)
  return boxDiv
}

export function NewTextArea(doc: Document, id: string, cssText: string): HTMLElement {
  const textArea = doc.createElement('textarea')
  textArea.style.cssText = cssText
  textArea.id = id
  return textArea
}

export function ApplyCancelButton(doc: Document): Element {
  const buttons: Button[] = [
    { id: 'applyButton', text: '应用' },
    { id: 'cancelButton', text: '取消' }
  ]

  const btnList = NewButtonList(doc, buttons)
  btnList.style.cssText =
    'margin-top:20px; display:flex; justify-content:center;align-items:center;gap: 50px'
  return btnList
}
