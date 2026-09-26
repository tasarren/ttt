import { defineComponent, h, ref, watch, onMounted, onBeforeUnmount, Teleport, useId } from "vue"
import { TButton } from "../atoms/TButton.ts"

export const TDialog = defineComponent({
  name: "TDialog", props: {
    modelValue: Boolean, title: {
      type: String, required: true,
    },
  }, emits: {
    "update:modelValue": (_v: boolean) => true,
  }, setup(p, { slots, emit }) {
    const element = ref<HTMLDialogElement>()
    const id = useId()
    let previous: HTMLElement | null = null
    function sync() {
      if (!element.value)
        return
      if (p.modelValue && !element.value.open) {
        previous = document.activeElement as HTMLElement
        element.value.showModal()
      }
      else if (!p.modelValue && element.value.open) {
        element.value.close()
        previous?.focus()
      }
    }
    watch(() => p.modelValue, sync, {
      flush: "post",
    })
    onMounted(sync)
    onBeforeUnmount(() => {
      element.value?.close()
      previous?.focus()
    })
    return () => h(Teleport, {
      to: "body",
    }, h("dialog", {
      ref: element, class: "ttt t-dialog", "aria-labelledby": id, onClose: () => {
        emit("update:modelValue", false)
        previous?.focus()
      },
    }, [
      h("header", {
        class: "t-surface-head",
      }, [
        h("h2", {
          id,
        }, p.title), h(TButton, {
          size: "sm", intent: "ghost", onClick: () => { emit("update:modelValue", false) },
        }, () => "Close"),
      ]), h("div", {
        class: "t-dialog-body",
      }, slots["default"]?.()),
    ]))
  },
})
