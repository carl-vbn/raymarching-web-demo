interface UIComponent {
    category?: string;
    build(): HTMLDivElement;
    destroy(): void;
}

export class Slider implements UIComponent {
    label: string;
    value: number;
    outRange = {min: 0, max: 1};
    displayRange = {min: 0, max: 100};
    category?: string;

    inputElement?: HTMLInputElement;
    valueElement?: HTMLDivElement;
    eventHandler?: () => void;

    callbacks: ((v: number) => void)[] = [];

    constructor(label: string, value: number) {
        this.label = label;
        this.value = value;
    }

    getDisplayValue(): string {
        return Math.floor(this.displayRange.min + this.value * (this.displayRange.max - this.displayRange.min)).toString();
    }

    build(): HTMLDivElement {
        const sliderContainer = document.createElement('div');
        sliderContainer.classList.add('slider');

        const label = document.createElement('div');
        label.classList.add('label');
        label.innerText = this.label;

        const valueDisplay = document.createElement('div');
        valueDisplay.classList.add('value');
        valueDisplay.innerText = this.getDisplayValue();

        const input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = '100';
        input.value = String(this.value * 100);
        input.style.setProperty('--after-width', `calc(${this.value * 100}% - ${18 * this.value}px)`);
        label.appendChild(valueDisplay);
        sliderContainer.appendChild(label);
        sliderContainer.appendChild(input);

        this.eventHandler = () => {
            if (!this.inputElement || !this.valueElement) return;

            
            const percent = parseFloat(this.inputElement.value);
            this.value = percent / 100;
            this.valueElement.innerText = this.getDisplayValue();
            this.inputElement.style.setProperty('--after-width', `calc(${this.value * 100}% - ${18 * this.value}px)`);

            this.callbacks.forEach(callback => callback(this.outRange.min + this.value * (this.outRange.max - this.outRange.min)));
        };

        input.addEventListener('input', this.eventHandler);

        this.inputElement = input;
        this.valueElement = valueDisplay;

        return sliderContainer;
    }

    destroy(): void {
        if (this.inputElement && this.eventHandler) {
            this.inputElement.removeEventListener('input', this.eventHandler);
        }
    }

    addCallback(callback: (v: number) => void): void {
        this.callbacks.push(callback);
    }

    getValue(): number {
        return this.value;
    }
}

function inverseLerp(a: number, b: number, v: number): number {
    return (v - a) / (b - a);
}

const uiComponents: UIComponent[] = [];

export function addSlider(
    label: string,
    range: {min?: number, max?: number, displayMin?: number, displayMax?: number, default: number},
    callback: (v: number) => void, category?: string
): Slider {
    range.min = range.min || 0;
    range.max = range.max || 1;
    const slider = new Slider(label, inverseLerp(range.min, range.max, range.default));
    slider.outRange.min = range.min;
    slider.outRange.max = range.max;
    slider.displayRange.min = range.displayMin || 0;
    slider.displayRange.max = range.displayMax || 100;
    slider.category = category;
    slider.addCallback(callback);
    uiComponents.push(slider);
    return slider;
}

function injectUIComponent(component: UIComponent, container: HTMLDivElement) {
    const componentElement = component.build();
    container.appendChild(componentElement);
}

function injectCategoryHeader(categoryName: string, container: HTMLDivElement) {
    const categoryHeaderText = document.createElement('h1');
    categoryHeaderText.innerText = categoryName;

    container.appendChild(categoryHeaderText);
    container.appendChild(document.createElement('hr'));
}

export function injectUI() {
    const uiContainer = document.getElementById('menu') as HTMLDivElement;

    const categories: { [key: string]: UIComponent[] } = {};
    
    for (const component of uiComponents) {
        const catName = component.category || '0#';
        
        if (!categories[catName]) {
            categories[catName] = [];
        }

        categories[catName].push(component);
    }

    const sortedCategories = Object.keys(categories).sort((a, b) => a.localeCompare(b));
    for (const catName of sortedCategories) {
        const displayName = catName.split('#')[1];

        if (displayName) {
            injectCategoryHeader(displayName, uiContainer);
        }

        for (const component of categories[catName]) {
            injectUIComponent(component, uiContainer);
        }
    }
}