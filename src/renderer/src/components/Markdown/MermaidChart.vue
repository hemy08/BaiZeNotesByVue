<template>
  <div ref="chartContainer" class="mermaid-chart"></div>
</template>

<script lang="ts">
import { Vue, Component, Ref } from 'vue-property-decorator';
import mermaid from 'mermaid';

@Component
export default class MermaidChart extends Vue {
  @Ref() readonly chartContainer!: HTMLDivElement;

  private chartCode = '';

  mounted() {
    this.renderChart();
  }

  watch: {
    chartCode(newVal) {
  this.renderChart();
}
}

methods: {
  renderChart() {
    mermaid.initialize({ startOnLoad: false });
    const svgGraph = mermaid.render('tempId', this.chartCode, { theme: 'forest' });
    this.chartContainer.innerHTML = svgGraph;
  }
}

// 提供 props 用于外部传入 Mermaid 图表代码
props: {
  code: {
    type: String,
  default: '',
      watcher: {
      handler(newVal) {
        this.chartCode = newVal;
      },
      immediate: true
    }
  }
}
}
</script>

<style scoped>
.mermaid-chart {
  width: 100%; /* 根据需要设置 */
  height: 100%; /* 根据需要设置 */
  overflow: auto; /* 如果需要滚动条的话 */
}
</style>
