import { defineComponent, h, ref, watch } from "vue"

export const TBrand = defineComponent({
  name: "TBrand", props: {
    logoSrc: String,
  }, setup(p) {
    const failed = ref(false)
    watch(() => p.logoSrc, () => {
      failed.value = false
    })
    return () => h("span", {
      class: "t-brand",
    }, [
      p.logoSrc && !failed.value ? h("img", {
        src: p.logoSrc, alt: "", onError: () => {
          failed.value = true
        },
      }) : null, "TTT",
    ])
  },
})
