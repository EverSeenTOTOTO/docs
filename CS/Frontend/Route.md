# hash和history路由

hash路由的原理是浏览器在监听到`hashchange`事件之后并不会刷新页面，这个功能本来是给页内锚点用的，所以使用hash路由会导致没法做锚点了，如果还需要类似锚点功能的话可以自己`scrollIntoView()`，同时hash路由传参也不方便，需要序列化为URL字符串，还有长度限制。

history路由的原理在于history的几个API可以改变浏览器路由栈却不刷新页面，其中`pushState`和`replaceState`还可以改变页面URL，再配合`popstate`事件，可以实现路由效果。比较奇怪的是`pushState`和`replaceState`默认不会触发`popstate`事件，需要我们自己调度。

在应用部署的时候，如果是通过Nginx之类的网关进行访问，history路由可能会面临一个fallback的问题，即未设置`try_files`的情况下访问二级页面会404。

Vue3两种模式的`vue-router`简要实现如下。其实完全可以在内存中维护路由栈，而非是由DOM事件驱动，真实的`vue-router`也的确是那样做的。

```js
export const RouterView = defineComponent({
  render() {
    return h(this.$router.current.value?.component);
  },
});

class BaseRouter {
  routes: Route[];

  current: ShallowRef<Route | undefined>;

  constructor(routes: Route[]) {
    this.routes = routes;
    this.current = shallowRef();
    window.addEventListener('load', this.navigate.bind(this));
  }

  navigate() {
    throw new Error('Method not implemented.');
  }

  install(app: App) {
    app.config.globalProperties.$router = this;
    app.component('RouterView', RouterView);
  }
}

export class HashRouter extends BaseRouter {
  constructor(routes: Route[]) {
    super(routes);
    window.addEventListener('hashchange', this.navigate.bind(this));
  }

  navigate(): void {
    const hash = window.location.hash.slice(1).replace(/^$/, '/');
    const route = this.routes.find((r) => r.path === hash);

    if (!route) throw new Error(`Route not found: ${hash}`);

    this.current.value = route;
  }
}

export class HistoryRouter extends BaseRouter {
  constructor(routes: Route[]) {
    super(routes);
    window.addEventListener('popstate', this.navigate.bind(this));
  }

  navigate(): void {
    const path = window.location.pathname.replace(/^$/, '/');
    const route = this.routes.find((r) => r.path === path);

    if (!route) throw new Error(`Route not found: ${path}`);

    this.current.value = route;
  }

  push(path: string): void {
    window.history.pushState({ path }, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
```

