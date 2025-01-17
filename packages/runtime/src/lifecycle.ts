import {
  DI,
  IContainer,
  IIndexable,
  IResolver,
  IServiceLocator,
  Registration,
} from '@aurelia/kernel';
import {
  HooksDefinition,
  PartialCustomElementDefinitionParts,
} from './definitions';
import {
  INode,
  INodeSequence,
  IRenderLocation,
} from './dom';
import {
  LifecycleFlags,
  State
} from './flags';
import {
  ILifecycleTask,
  MaybePromiseOrTask,
} from './lifecycle-task';
import {
  IBatchable,
  IBindingTargetAccessor,
  IScope,
} from './observation';
import {
  IElementProjector,
  CustomElementDefinition,
  PartialCustomElementDefinition,
} from './resources/custom-element';
import {
  IRenderContext,
  ICompiledRenderContext,
} from './templating/render-context';
import {
  Scope,
} from './observation/binding-context';

export interface IBinding {
  interceptor: this;
  readonly locator: IServiceLocator;
  readonly $scope?: IScope;
  /**
   * The name of the `replace-part` template that this binding was declared inside of (if any, otherwise this property is `undefined`).
   *
   * This property is passed through the AST during evaluation, which allows the scope traversal to go up to the scope of the `replace-part` if a property does not exist inside the `replaceable`.
   */
  readonly part?: string;
  readonly $state: State;
  $bind(flags: LifecycleFlags, scope: IScope, part?: string): void;
  $unbind(flags: LifecycleFlags): void;
}

export const enum ViewModelKind {
  customElement,
  customAttribute,
  synthetic
}

export type IHydratedController<T extends INode = INode> = ISyntheticView<T> | ICustomElementController<T> | ICustomAttributeController<T>;
export type IHydratedComponentController<T extends INode = INode> = ICustomElementController<T> | ICustomAttributeController<T>;
export type IHydratedRenderableController<T extends INode = INode> = ISyntheticView<T> | ICustomElementController<T>;

/**
 * The base type for all controller types.
 *
 * Every controller, regardless of their type and state, will have at least the properties/methods in this interface.
 */
export interface IController<
  T extends INode = INode,
  C extends IViewModel<T> = IViewModel<T>,
> {
  /** @internal */readonly id: number;
  readonly flags: LifecycleFlags;
  readonly state: State;

  parent?: IHydratedController<T>;

  readonly lifecycle: ILifecycle;
  readonly hooks: HooksDefinition;
  readonly vmKind: ViewModelKind;

  part: string | undefined;

  bind(flags: LifecycleFlags, scope?: IScope, partName?: string): ILifecycleTask;
  unbind(flags: LifecycleFlags): ILifecycleTask;
  attach(flags: LifecycleFlags): void;
  detach(flags: LifecycleFlags): void;
  cache(flags: LifecycleFlags): void;
}

/**
 * The base type for `ICustomAttributeController` and `ICustomElementController`.
 *
 * Both of those types have the `viewModel` and `bindingContext` properties which represent the user instance containing the bound properties and hooks for this component.
 */
export interface IComponentController<
  T extends INode = INode,
  C extends IViewModel<T> = IViewModel<T>,
> extends IController<T, C> {
  readonly vmKind: ViewModelKind.customAttribute | ViewModelKind.customElement;

  /**
   * The user instance containing the bound properties. This is always an instance of a class, which may either be user-defined, or generated by a view locator.
   *
   * This is the raw instance; never a proxy.
   */
  readonly viewModel: C;
  /**
   * In Proxy observation mode, this will be a proxy that wraps the view model, otherwise it is the exactly the same reference to the same object.
   *
   * This property is / should be used for creating the `Scope` and invoking lifecycle hooks.
   */
  readonly bindingContext: C & IIndexable;

  /** @internal */nextBound: IComponentController | undefined;
  /** @internal */nextUnbound: IComponentController | undefined;
  /** @internal */prevBound: IComponentController | undefined;
  /** @internal */prevUnbound: IComponentController | undefined;

  /** @internal */nextAttached: IComponentController | undefined;
  /** @internal */nextDetached: IComponentController | undefined;
  /** @internal */prevAttached: IComponentController | undefined;
  /** @internal */prevDetached: IComponentController | undefined;

  /** @internal */afterBind(flags: LifecycleFlags): void;
  /** @internal */afterUnbind(flags: LifecycleFlags): void;
  /** @internal */afterAttach(flags: LifecycleFlags): void;
  /** @internal */afterDetach(flags: LifecycleFlags): void;
}

/**
 * The base type for `ISyntheticView` and `ICustomElementController`.
 *
 * Both of those types can:
 * - Have `bindings` and `controllers` which are populated during rendering (hence, 'Renderable').
 * - Have physical DOM nodes that can be mounted.
 */
export interface IRenderableController<
  T extends INode = INode,
  C extends IViewModel<T> = IViewModel<T>,
> extends IController<T, C> {
  readonly vmKind: ViewModelKind.customElement | ViewModelKind.synthetic;

  /** @internal */nextMount: IRenderableController | undefined;
  /** @internal */nextUnmount: IRenderableController | undefined;
  /** @internal */prevMount: IRenderableController | undefined;
  /** @internal */prevUnmount: IRenderableController | undefined;

  readonly bindings: readonly IBinding[] | undefined;
  readonly controllers: readonly IHydratedController<T>[] | undefined;

  /** @internal */mount(flags: LifecycleFlags): void;
  /** @internal */unmount(flags: LifecycleFlags): void;

  getTargetAccessor(propertyName: string): IBindingTargetAccessor | undefined;

  addBinding(binding: IBinding): void;
  addController(controller: IController<T>): void;
}

/**
 * The controller for a synthetic view, that is, a controller created by an `IViewFactory`.
 *
 * A synthetic view, typically created when rendering a template controller (`if`, `repeat`, etc), is a renderable component with mountable DOM nodes that has no user view model.
 *
 * It has either its own synthetic binding context or is locked to some externally sourced scope (in the case of `au-compose`)
 */
export interface ISyntheticView<
  T extends INode = INode,
> extends IRenderableController<T> {
  readonly vmKind: ViewModelKind.synthetic;
  readonly viewModel: undefined;
  readonly bindingContext: undefined;
  /**
   * The scope that belongs to this view. This property will always be defined when the `state` property of this view indicates that the view is currently bound.
   *
   * The `scope` may be set during `bind()` and unset during `unbind()`, or it may be statically set during rendering with `lockScope()`.
   */
  readonly scope: Scope | undefined;
  /**
   * The compiled render context used for rendering this view. Compilation was done by the `IViewFactory` prior to creating this view.
   */
  readonly context: ICompiledRenderContext<T>;
  /**
   * The names of the `replace` parts that were declared in the same scope as this view's template.
   *
   * The `replaceable` template controllers with those names will use this view's scope as the outer scope for properties that don't exist on the inner scope.
   */
  readonly scopeParts: readonly string[];
  readonly isStrictBinding: boolean;
  /**
   * The physical DOM nodes that will be appended during the `mount()` operation.
   */
  readonly nodes: INodeSequence<T>;
  /**
   * The DOM node that this view will be mounted to.
   */
  readonly location: IRenderLocation<T> | undefined;

  /**
   * Lock this view's scope to the provided `IScope`. The scope, which is normally set during `bind()`, will then not change anymore.
   *
   * This is used by `au-compose` to set the binding context of a view to a particular component instance.
   *
   * @param scope - The scope to lock this view to.
   */
  lockScope(scope: IScope): void;
  /**
   * Set the DOM node that this view will be mounted to, as well as the mounting mechanism that will be used.
   *
   * @param location - The `IRenderLocation` that this view will be mounted to.
   * @param mountStrategy - The method that will be used during mounting.
   */
  hold(location: IRenderLocation<T>, mountStrategy: MountStrategy): void;
  /**
   * Mark this view as not-in-use, so that it can either be dereferenced and garbage-collected, or returned to cache if caching was enabled for this view.
   *
   * If this view is not attached when this method is called, it will immediately be unmounted (if it was still mounted) and returned to cache (if it could be cached).
   *
   * @param flags - The flags to pass to the synchronous unmount operation.
   */
  release(flags: LifecycleFlags): boolean;
}

export interface ICustomAttributeController<
  T extends INode = INode,
  C extends ICustomAttributeViewModel<T> = ICustomAttributeViewModel<T>,
> extends IComponentController<T, C> {
  readonly vmKind: ViewModelKind.customAttribute;
  /**
   * @inheritdoc
   */
  readonly viewModel: C;
  /**
   * @inheritdoc
   */
  readonly bindingContext: C & IIndexable;
  /**
   * The scope that belongs to this custom attribute. This property will always be defined when the `state` property of this view indicates that the view is currently bound.
   *
   * The `scope` will be set during `bind()` and unset during `unbind()`.
   *
   * The scope's `bindingContext` will be the same instance as this controller's `bindingContext` property.
   */
  readonly scope: Scope | undefined;
}

/**
 * A representation of `IController` specific to a custom element whose `create` hook is about to be invoked (if present).
 *
 * It is not yet hydrated (hence 'dry') with any rendering-specific information.
 */
export interface IDryCustomElementController<
  T extends INode = INode,
  C extends IViewModel<T> = IViewModel<T>,
> extends IComponentController<T, C>, IRenderableController<T, C> {
  readonly vmKind: ViewModelKind.customElement;
  /**
   * The scope that belongs to this custom element. This property is set immediately after the controller is created and is always guaranteed to be available.
   *
   * It may be overwritten by end user during the `create()` hook.
   *
   * By default, the scope's `bindingContext` will be the same instance as this controller's `bindingContext` property.
   */
  scope: Scope;
  /**
   * The physical DOM node that this controller's `nodes` will be mounted to.
   */
  host: T;
}

/**
 * A representation of `IController` specific to a custom element whose `beforeCompile` hook is about to be invoked (if present).
 *
 * It has the same properties as `IDryCustomElementController`, as well as a render context (hence 'contextual').
 */
export interface IContextualCustomElementController<
  T extends INode = INode,
  C extends IViewModel<T> = IViewModel<T>,
> extends IDryCustomElementController<T, C> {
  /**
   * The non-compiled render context used for compiling this component's `CustomElementDefinition`.
   */
  readonly context: IRenderContext<T>;
}

/**
 * A representation of `IController` specific to a custom element whose `afterCompile` hook is about to be invoked (if present).
 *
 * It has the same properties as `IContextualCustomElementController`, except the context is now compiled (hence 'compiled'), as well as the nodes, and projector.
 */
export interface ICompiledCustomElementController<
  T extends INode = INode,
  C extends IViewModel<T> = IViewModel<T>,
> extends IContextualCustomElementController<T, C> {
  /**
   * The compiled render context used for hydrating this controller.
   */
  readonly context: ICompiledRenderContext<T>;
  /**
   * The names of the `replace` parts that were declared in the same scope as this component's template.
   *
   * The `replaceable` template controllers with those names will use this components's scope as the outer scope for properties that don't exist on the inner scope.
   */
  readonly scopeParts: readonly string[];
  readonly isStrictBinding: boolean;
  /**
   * The projector used for mounting the `nodes` of this controller. Typically this will be one of:
   * - `HostProjector` (the host is a normal DOM node)
   * - `ShadowDOMProjector` (the host is a shadow root)
   * - `ContainerlessProjector` (the host is a comment node)
   */
  readonly projector: IElementProjector<T>;
  /**
   * The physical DOM nodes that will be appended during the `mount()` operation.
   */
  readonly nodes: INodeSequence<T>;
}

/**
 * A fully hydrated custom element controller.
 */
export interface ICustomElementController<
  T extends INode = INode,
  C extends ICustomElementViewModel<T> = ICustomElementViewModel<T>,
> extends ICompiledCustomElementController<T, C> {
  /**
   * @inheritdoc
   */
  readonly viewModel: C;
  /**
   * @inheritdoc
   */
  readonly bindingContext: C & IIndexable;
}

export const IController = DI.createInterface<IController>('IController').noDefault();

/**
 * Describing characteristics of a mounting operation a controller will perform
 */
export const enum MountStrategy {
  insertBefore = 1,
  append = 2,
}

export interface IViewCache<T extends INode = INode> {
  readonly isCaching: boolean;
  setCacheSize(size: number | '*', doNotOverrideIfAlreadySet: boolean): void;
  canReturnToCache(view: ISyntheticView<T>): boolean;
  tryReturnToCache(view: ISyntheticView<T>): boolean;
}

export interface IViewFactory<T extends INode = INode> extends IViewCache<T> {
  readonly name: string;
  readonly parts: PartialCustomElementDefinitionParts | undefined;
  create(flags?: LifecycleFlags): ISyntheticView<T>;
  resolve(requestor: IContainer, parts?: PartialCustomElementDefinitionParts): IViewFactory<T>;
}

export const IViewFactory = DI.createInterface<IViewFactory>('IViewFactory').noDefault();

/**
 * Defines optional lifecycle hooks that will be called only when they are implemented.
 */
export interface IViewModel<T extends INode = INode> {
  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor: Function;
  readonly $controller?: IController<T, this>;
  beforeBind?(flags: LifecycleFlags): MaybePromiseOrTask;
  afterBind?(flags: LifecycleFlags): void;
  beforeUnbind?(flags: LifecycleFlags): MaybePromiseOrTask;
  afterUnbind?(flags: LifecycleFlags): void;
  beforeAttach?(flags: LifecycleFlags): void;
  afterAttach?(flags: LifecycleFlags): void;
  beforeDetach?(flags: LifecycleFlags): void;
  afterDetach?(flags: LifecycleFlags): void;
  caching?(flags: LifecycleFlags): void;
}

export interface ICustomElementViewModel<T extends INode = INode> extends IViewModel<T> {
  readonly $controller?: ICustomElementController<T, this>;
  create?(
    controller: IDryCustomElementController<T, this>,
    parentContainer: IContainer,
    definition: CustomElementDefinition,
    parts: PartialCustomElementDefinitionParts | undefined,
  ): PartialCustomElementDefinition | void;
  beforeCompile?(
    controller: IContextualCustomElementController<T, this>,
  ): void;
  afterCompile?(
    controller: ICompiledCustomElementController<T, this>,
  ): void;
  afterCompileChildren?(
    controller: ICustomElementController<T, this>,
  ): void;
}

export interface ICustomAttributeViewModel<T extends INode = INode> extends IViewModel<T> {
  readonly $controller?: ICustomAttributeController<T, this>;
}

export interface IHydratedCustomElementViewModel<T extends INode = INode> extends ICustomElementViewModel<T> {
  readonly $controller: ICustomElementController<T, this>;
}

export interface IHydratedCustomAttributeViewModel<T extends INode = INode> extends ICustomAttributeViewModel<T> {
  readonly $controller: ICustomAttributeController<T, this>;
}

export interface ILifecycle {
  readonly batch: IAutoProcessingQueue<IBatchable>;

  readonly mount: IProcessingQueue<IController>;
  readonly unmount: IProcessingQueue<IController>;

  readonly afterBind: IAutoProcessingQueue<IController>;
  readonly afterUnbind: IAutoProcessingQueue<IController>;

  readonly afterAttach: IAutoProcessingQueue<IController>;
  readonly afterDetach: IAutoProcessingQueue<IController>;
}

export const ILifecycle = DI.createInterface<ILifecycle>('ILifecycle').withDefault(x => x.singleton(Lifecycle));

export interface IProcessingQueue<T> {
  add(requestor: T): void;
  remove(requestor: T): void;
  process(flags: LifecycleFlags): void;
}

export interface IAutoProcessingQueue<T> extends IProcessingQueue<T> {
  readonly depth: number;
  begin(): void;
  end(flags?: LifecycleFlags): void;
  inline(fn: () => void, flags?: LifecycleFlags): void;
}

export class BoundQueue implements IAutoProcessingQueue<IController> {
  public depth: number = 0;

  public head: IComponentController | undefined = void 0;
  public tail: IComponentController | undefined = void 0;

  public constructor(
    @ILifecycle public readonly lifecycle: ILifecycle,
  ) {}

  public begin(): void {
    ++this.depth;
  }

  public end(flags?: LifecycleFlags): void {
    if (flags === void 0) {
      flags = LifecycleFlags.none;
    }
    if (--this.depth === 0) {
      this.process(flags);
    }
  }

  public inline(fn: () => void, flags?: LifecycleFlags): void {
    this.begin();
    fn();
    this.end(flags);
  }

  public add(controller: IComponentController): void {
    if (this.head === void 0) {
      this.head = controller;
    } else {
      controller.prevBound = this.tail;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.tail!.nextBound = controller; // implied by boundHead not being undefined
    }
    this.tail = controller;
  }

  public remove(controller: IComponentController): void {
    if (controller.prevBound !== void 0) {
      controller.prevBound.nextBound = controller.nextBound;
    }
    if (controller.nextBound !== void 0) {
      controller.nextBound.prevBound = controller.prevBound;
    }
    controller.prevBound = void 0;
    controller.nextBound = void 0;
    if (this.tail === controller) {
      this.tail = controller.prevBound;
    }
    if (this.head === controller) {
      this.head = controller.nextBound;
    }
  }

  public process(flags: LifecycleFlags): void {
    while (this.head !== void 0) {
      let cur = this.head;
      this.head = this.tail = void 0;
      let next: IComponentController | undefined;
      do {
        cur.afterBind(flags);
        next = cur.nextBound;
        cur.nextBound = void 0;
        cur.prevBound = void 0;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cur = next!; // we're checking it for undefined the next line
      } while (cur !== void 0);
    }
  }
}

export class UnboundQueue implements IAutoProcessingQueue<IController> {
  public depth: number = 0;

  public head: IComponentController | undefined = void 0;
  public tail: IComponentController | undefined = void 0;

  public constructor(
    @ILifecycle public readonly lifecycle: ILifecycle,
  ) {}

  public begin(): void {
    ++this.depth;
  }

  public end(flags?: LifecycleFlags): void {
    if (flags === void 0) {
      flags = LifecycleFlags.none;
    }
    if (--this.depth === 0) {
      this.process(flags);
    }
  }

  public inline(fn: () => void, flags?: LifecycleFlags): void {
    this.begin();
    fn();
    this.end(flags);
  }

  public add(controller: IComponentController): void {
    if (this.head === void 0) {
      this.head = controller;
    } else {
      controller.prevUnbound = this.tail;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.tail!.nextUnbound = controller; // implied by unboundHead not being undefined
    }
    this.tail = controller;
  }

  public remove(controller: IComponentController): void {
    if (controller.prevUnbound !== void 0) {
      controller.prevUnbound.nextUnbound = controller.nextUnbound;
    }
    if (controller.nextUnbound !== void 0) {
      controller.nextUnbound.prevUnbound = controller.prevUnbound;
    }
    controller.prevUnbound = void 0;
    controller.nextUnbound = void 0;
    if (this.tail === controller) {
      this.tail = controller.prevUnbound;
    }
    if (this.head === controller) {
      this.head = controller.nextUnbound;
    }
  }

  public process(flags: LifecycleFlags): void {
    while (this.head !== void 0) {
      let cur = this.head;
      this.head = this.tail = void 0;
      let next: IComponentController | undefined;
      do {
        cur.afterUnbind(flags);
        next = cur.nextUnbound;
        cur.nextUnbound = void 0;
        cur.prevUnbound = void 0;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cur = next!; // we're checking it for undefined the next line
      } while (cur !== void 0);
    }
  }
}

export class AttachedQueue implements IAutoProcessingQueue<IController> {
  public depth: number = 0;

  public head: IComponentController | undefined = void 0;
  public tail: IComponentController | undefined = void 0;

  public constructor(
    @ILifecycle public readonly lifecycle: ILifecycle,
  ) {}

  public begin(): void {
    ++this.depth;
  }

  public end(flags?: LifecycleFlags): void {
    if (flags === void 0) {
      flags = LifecycleFlags.none;
    }
    if (--this.depth === 0) {
      // temporary, until everything else works and we're ready for integrating mount/unmount in the RAF queue
      this.lifecycle.mount.process(flags);
      this.process(flags);
    }
  }

  public inline(fn: () => void, flags?: LifecycleFlags): void {
    this.begin();
    fn();
    this.end(flags);
  }

  public add(controller: IComponentController): void {
    if (this.head === void 0) {
      this.head = controller;
    } else {
      controller.prevAttached = this.tail;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.tail!.nextAttached = controller; // implied by attachedHead not being undefined
    }
    this.tail = controller;
  }

  public remove(controller: IComponentController): void {
    if (controller.prevAttached !== void 0) {
      controller.prevAttached.nextAttached = controller.nextAttached;
    }
    if (controller.nextAttached !== void 0) {
      controller.nextAttached.prevAttached = controller.prevAttached;
    }
    controller.prevAttached = void 0;
    controller.nextAttached = void 0;
    if (this.tail === controller) {
      this.tail = controller.prevAttached;
    }
    if (this.head === controller) {
      this.head = controller.nextAttached;
    }
  }

  public process(flags: LifecycleFlags): void {
    while (this.head !== void 0) {
      let cur = this.head;
      this.head = this.tail = void 0;
      let next: IComponentController | undefined;
      do {
        cur.afterAttach(flags);
        next = cur.nextAttached;
        cur.nextAttached = void 0;
        cur.prevAttached = void 0;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cur = next!; // we're checking it for undefined the next line
      } while (cur !== void 0);
    }
  }
}

export class DetachedQueue implements IAutoProcessingQueue<IController> {
  public depth: number = 0;

  public head: IComponentController | undefined = void 0;
  public tail: IComponentController | undefined = void 0;

  public constructor(
    @ILifecycle public readonly lifecycle: ILifecycle,
  ) {}

  public begin(): void {
    ++this.depth;
  }

  public end(flags?: LifecycleFlags): void {
    if (flags === void 0) {
      flags = LifecycleFlags.none;
    }
    if (--this.depth === 0) {
      // temporary, until everything else works and we're ready for integrating mount/unmount in the RAF queue
      this.lifecycle.unmount.process(flags);
      this.process(flags);
    }
  }

  public inline(fn: () => void, flags?: LifecycleFlags): void {
    this.begin();
    fn();
    this.end(flags);
  }

  public add(controller: IComponentController): void {
    if (this.head === void 0) {
      this.head = controller;
    } else {
      controller.prevDetached = this.tail;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.tail!.nextDetached = controller; // implied by detachedHead not being undefined
    }
    this.tail = controller;
  }

  public remove(controller: IComponentController): void {
    if (controller.prevDetached !== void 0) {
      controller.prevDetached.nextDetached = controller.nextDetached;
    }
    if (controller.nextDetached !== void 0) {
      controller.nextDetached.prevDetached = controller.prevDetached;
    }
    controller.prevDetached = void 0;
    controller.nextDetached = void 0;
    if (this.tail === controller) {
      this.tail = controller.prevDetached;
    }
    if (this.head === controller) {
      this.head = controller.nextDetached;
    }
  }

  public process(flags: LifecycleFlags): void {
    while (this.head !== void 0) {
      let cur = this.head;
      this.head = this.tail = void 0;
      let next: IComponentController | undefined;
      do {
        cur.afterDetach(flags);
        next = cur.nextDetached;
        cur.nextDetached = void 0;
        cur.prevDetached = void 0;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cur = next!; // we're checking it for undefined the next line
      } while (cur !== void 0);
    }
  }
}

export class MountQueue implements IProcessingQueue<IController> {
  public depth: number = 0;

  public head: IRenderableController | undefined = void 0;
  public tail: IRenderableController | undefined = void 0;

  public constructor(
    @ILifecycle public readonly lifecycle: ILifecycle,
  ) {}

  public add(controller: IRenderableController): void {
    if (this.head === void 0) {
      this.head = controller;
    } else {
      controller.prevMount = this.tail;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.tail!.nextMount = controller; // implied by mountHead not being undefined
    }
    this.tail = controller;
  }

  public remove(controller: IRenderableController): void {
    if (controller.prevMount !== void 0) {
      controller.prevMount.nextMount = controller.nextMount;
    }
    if (controller.nextMount !== void 0) {
      controller.nextMount.prevMount = controller.prevMount;
    }
    controller.prevMount = void 0;
    controller.nextMount = void 0;
    if (this.tail === controller) {
      this.tail = controller.prevMount;
    }
    if (this.head === controller) {
      this.head = controller.nextMount;
    }
  }

  public process(flags: LifecycleFlags): void {
    let i = 0;
    while (this.head !== void 0) {
      let cur = this.head;
      this.head = this.tail = void 0;
      let next: IRenderableController | undefined;
      do {
        ++i;
        cur.mount(flags);
        next = cur.nextMount;
        cur.nextMount = void 0;
        cur.prevMount = void 0;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cur = next!; // we're checking it for undefined the next line
      } while (cur !== void 0);
    }
  }
}

export class UnmountQueue implements IProcessingQueue<IController> {
  public head: IRenderableController | undefined = void 0;
  public tail: IRenderableController | undefined = void 0;

  public constructor(
    @ILifecycle public readonly lifecycle: ILifecycle,
  ) {}

  public add(controller: IRenderableController): void {
    if (this.head === void 0) {
      this.head = controller;
    } else {
      controller.prevUnmount = this.tail;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.tail!.nextUnmount = controller; // implied by unmountHead not being undefined
    }
    this.tail = controller;
  }

  public remove(controller: IRenderableController): void {
    if (controller.prevUnmount !== void 0) {
      controller.prevUnmount.nextUnmount = controller.nextUnmount;
    }
    if (controller.nextUnmount !== void 0) {
      controller.nextUnmount.prevUnmount = controller.prevUnmount;
    }
    controller.prevUnmount = void 0;
    controller.nextUnmount = void 0;
    if (this.tail === controller) {
      this.tail = controller.prevUnmount;
    }
    if (this.head === controller) {
      this.head = controller.nextUnmount;
    }
  }

  public process(flags: LifecycleFlags): void {
    let i = 0;
    while (this.head !== void 0) {
      let cur = this.head;
      this.head = this.tail = void 0;
      let next: IRenderableController | undefined;
      do {
        ++i;
        cur.unmount(flags);
        next = cur.nextUnmount;
        cur.nextUnmount = void 0;
        cur.prevUnmount = void 0;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cur = next!; // we're checking it for undefined the next line
      } while (cur !== void 0);
    }
  }
}

export class BatchQueue implements IAutoProcessingQueue<IBatchable> {
  public queue: IBatchable[] = [];
  public depth: number = 0;

  public constructor(
    @ILifecycle public readonly lifecycle: ILifecycle,
  ) {}

  public begin(): void {
    ++this.depth;
  }

  public end(flags?: LifecycleFlags): void {
    if (flags === void 0) {
      flags = LifecycleFlags.none;
    }
    if (--this.depth === 0) {
      this.process(flags);
    }
  }

  public inline(fn: () => void, flags?: LifecycleFlags): void {
    this.begin();
    fn();
    this.end(flags);
  }

  public add(requestor: IBatchable): void {
    this.queue.push(requestor);
  }

  public remove(requestor: IBatchable): void {
    const index = this.queue.indexOf(requestor);
    if (index > -1) {
      this.queue.splice(index, 1);
    }
  }

  public process(flags: LifecycleFlags): void {
    flags |= LifecycleFlags.fromBatch;
    while (this.queue.length > 0) {
      const batch = this.queue.slice();
      this.queue = [];
      const { length } = batch;
      for (let i = 0; i < length; ++i) {
        batch[i].flushBatch(flags);
      }
    }
  }
}

export class Lifecycle implements ILifecycle {
  public readonly batch: IAutoProcessingQueue<IBatchable> = new BatchQueue(this);

  public readonly mount: IProcessingQueue<IController> = new MountQueue(this);
  public readonly unmount: IProcessingQueue<IController> = new UnmountQueue(this);

  public readonly afterBind: IAutoProcessingQueue<IController> = new BoundQueue(this);
  public readonly afterUnbind: IAutoProcessingQueue<IController> = new UnboundQueue(this);

  public readonly afterAttach: IAutoProcessingQueue<IController> = new AttachedQueue(this);
  public readonly afterDetach: IAutoProcessingQueue<IController> = new DetachedQueue(this);

  public static register(container: IContainer): IResolver<ILifecycle> {
    return Registration.singleton(ILifecycle, this).register(container);
  }
}
